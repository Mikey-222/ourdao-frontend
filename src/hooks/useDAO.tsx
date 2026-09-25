'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useWallet } from '@/lib/wallet'
import { CONTRACT_ID, isContractConfigured, getTransactionUrl } from '@/lib/stellar'
import { daoRead, daoWrite } from '@/lib/dao-client'
import { backend, type BackendEvent } from '@/lib/backend'
import type { UserData, DAOStats } from '@/types/dao'
import { MemberStatus } from '@/types/dao'

import { asBigInt, toLoan, toMemberStatus } from '@/lib/dao-mappers'
export { asBigInt, toLoan, toMemberStatus }

export function useDAOContract() {
  return { contractId: CONTRACT_ID, configured: isContractConfigured() }
}

/** Aggregated data for the connected member. */
export function useUserData(): UserData {
  const { address, isConnected } = useWallet()

  const { data } = useQuery({
    queryKey: ['userData', address],
    enabled: !!address && isContractConfigured(),
    queryFn: async () => {
      const [isMember, isAdmin, member, pendingYield, exitShare] = await Promise.all([
        daoRead.isMember(address!),
        daoRead.isAdmin(address!),
        daoRead.getMember(address!),
        daoRead.getPendingYield(address!),
        daoRead.calculateExitShare ? daoRead.calculateExitShare(address!).catch(() => null) : Promise.resolve(null),
      ])
      return { isMember, isAdmin, member, pendingYield, exitShare }
    },
  })

  // Loan history comes from the off-chain indexer (the contract keeps no
  // queryable per-member loan list). Independent of contract configuration so
  // it still resolves when only the backend URL is set.
  const { data: loans } = useQuery({
    queryKey: ['userLoans', address],
    enabled: !!address,
    queryFn: () => backend.getLoans(address!),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })

  const m = data?.member
  return {
    isConnected,
    address: address || undefined,
    isMember: !!data?.isMember,
    isAdmin: !!data?.isAdmin,
    member: m
      ? {
          memberAddress: String(m.address ?? address),
          status: toMemberStatus(m.status),
          joinDate: Number(m.join_ledger ?? 0),
          contributionAmount: asBigInt(m.contribution),
          // Member.share_balance in ourdao-contracts is a dead field (only set at join/exit, never updated).
          // Paired contract issue: https://github.com/Mikey-222/ourdao-contracts/issues/42
          // We query daoRead.calculateExitShare(address) to compute the member's live treasury claim.
          shareBalance: asBigInt(data?.exitShare ?? m.share_balance),
          hasActiveLoan: !!m.has_active_loan,
          lastLoanDate: Number(m.last_loan_time ?? 0),
        }
      : undefined,
    votingWeight: 1,
    pendingRewards: asBigInt(data?.pendingYield),
    pendingYield: asBigInt(data?.pendingYield),
    hasActiveLoan: !!m?.has_active_loan,
    loans: (loans ?? []).map(toLoan),
  }
}

export type ExtendedStats = DAOStats & {
  initialized: boolean
  isPaused: boolean
  membershipFee: bigint
  consensusThreshold: number
  indexerStale: boolean
  secondsSinceUpdate: number | null
  interestCollected: string
  principalLent: string
  principalRepaid: string
  valueDefaulted: string
  defaultedLoans: number
  totalDefaultedValue: string
  features: {
    ensVoting: boolean
    documentStorage: boolean
    privateVoting: boolean
    confidentialLoans: boolean
    restaking: boolean
  }
}

export function useDAOStats(): ExtendedStats {
  const { data } = useQuery({
    queryKey: ['daoStats'],
    enabled: isContractConfigured(),
    queryFn: async () => {
      const [totalMembers, activeMembers, threshold, treasury, policy, isPaused] =
        await Promise.all([
          daoRead.getTotalMembers(),
          daoRead.getActiveMembers(),
          daoRead.getConsensusThreshold(),
          daoRead.getTreasuryBalance(),
          daoRead.getLoanPolicy(),
          daoRead.isPaused(),
        ])
      return { totalMembers, activeMembers, threshold, treasury, policy, isPaused }
    },
  })

  // Loan counts and total stake are aggregated by the off-chain indexer, which
  // sees the full event history the contract doesn't keep queryable.
  const { data: agg } = useQuery({
    queryKey: ['daoStatsBackend'],
    queryFn: () => backend.getStats(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })

  const membershipFee = asBigInt(
    (data?.policy as Record<string, unknown> | undefined)?.membership_contribution
  )

  return {
    totalMembers: Number(data?.totalMembers ?? 0),
    activeMembers: Number(data?.activeMembers ?? 0),
    totalLoans: agg?.totalLoans ?? 0,
    activeLoans: agg?.activeLoans ?? 0,
    treasuryBalance: asBigInt(data?.treasury),
    totalYieldGenerated: BigInt(0),
    totalRestaked: asBigInt(agg?.totalStaked),
    initialized: isContractConfigured() && data?.threshold != null,
    isPaused: !!data?.isPaused,
    membershipFee,
    consensusThreshold: Number(data?.threshold ?? 0),
    indexerStale: agg?.indexerStale ?? false,
    secondsSinceUpdate: agg?.secondsSinceUpdate ?? null,
    interestCollected: agg?.interestCollected ?? '0',
    principalLent: agg?.principalLent ?? '0',
    principalRepaid: agg?.principalRepaid ?? '0',
    valueDefaulted: agg?.valueDefaulted ?? '0',
    defaultedLoans: agg?.defaultedLoans ?? 0,
    totalDefaultedValue: agg?.totalDefaultedValue ?? '0',
    // The Soroban port's native modules are always compiled in.
    features: {
      ensVoting: true, // name registry
      documentStorage: true, // content-hash metadata
      privateVoting: true, // commit-reveal
      confidentialLoans: false,
      restaking: true, // staking
    },
  }
}

/**
 * Shared plumbing for a write action: resolves the wallet + signer, tracks
 * pending/success/error, and surfaces toasts. Returns a runner plus state.
 */
function useWriteAction() {
  const { address, signXDR, isConnected } = useWallet()
  const [isPending, setPending] = useState(false)
  const [isSuccess, setSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const run = useCallback(
    async (
      label: string,
      fn: (w: ReturnType<typeof daoWrite>) => Promise<{ hash: string }>
    ) => {
      if (!isConnected || !address) {
        toast.error('Connect your wallet first')
        throw new Error('Wallet not connected')
      }
      setPending(true)
      setSuccess(false)
      setError(null)
      const toastId = toast.loading(`${label}…`)
      try {
        const res = await fn(daoWrite(address, signXDR))
        setSuccess(true)
        toast.success(
          <span>
            {label} confirmed{' '}
            <a
              href={getTransactionUrl(res.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View transaction
            </a>
          </span>,
          { id: toastId, duration: 8000 }
        )
        return res
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        toast.error(`${label} failed: ${e.message}`, { id: toastId })
        throw e
      } finally {
        setPending(false)
      }
    },
    [address, isConnected, signXDR]
  )

  return { run, isPending, isSuccess, error }
}

export function useMemberRegistration() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const registerMember = () => run('Registering membership', (w) => w.registerMember())
  return { registerMember, isPending, error, isSuccess }
}

export function useLoanRequest() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const requestLoan = (
    amount: bigint,
    _isPrivate = false,
    _commitment?: string,
    _documentHash?: string
  ) => run('Requesting loan', (w) => w.requestLoan(amount))
  return { requestLoan, isPending, error, isSuccess }
}

export function useVoting() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const voteOnProposal = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnLoanProposal(proposalId, support))
  return { voteOnProposal, isPending, error, isSuccess }
}

export function useLoanRepayment() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  // repay_loan takes no amount argument — the contract always collects the
  // full outstanding balance (total_repayment - amount_repaid) in one shot.
  const repayLoan = (loanId: number) => run('Repaying loan', (w) => w.repayLoan(loanId))
  return { repayLoan, isPending, error, isSuccess }
}

export function useMarkLoanDefaulted() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  // Permissionless: mark_loan_defaulted takes no caller argument, so this
  // works even for a connected wallet that isn't the borrower or an admin.
  const markLoanDefaulted = (loanId: number) =>
    run('Marking loan defaulted', (w) => w.markLoanDefaulted(loanId))
  return { markLoanDefaulted, isPending, error, isSuccess }
}

export function useRewards() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const claimRewards = () => run('Claiming rewards', (w) => w.claimRewards())
  const claimYield = () => run('Claiming yield', (w) => w.claimRewards())
  return { claimRewards, claimYield, isPending, error, isSuccess }
}

// Contract events, indexed off-chain by ourdao-backend (which polls the RPC's
// getEvents) and served from its raw event feed. Kept read-only; `setEvents`
// remains for call-site compatibility with the previous shell.
export function useDAOEvents() {
  const { data } = useQuery({
    queryKey: ['daoEvents'],
    queryFn: () => backend.getEvents(50),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const events = (data ?? []) as unknown as Record<string, unknown>[]
  const setEvents = (_: Record<string, unknown>[]) => {}
  return { events, setEvents }
}

/** Human-readable label for a raw contract event topic symbol (e.g. `loan_dflt`
 *  -> "Loan defaulted"). Unknown symbols fall back to the raw name rather than
 *  a generic "Unknown event" so new event types stay legible without a code change. */
const EVENT_LABELS: Record<string, string> = {
  joined: 'New member joined',
  exited: 'Member exited',
  claimed: 'Yield claimed',
  loan_req: 'Loan requested',
  loan_edit: 'Loan proposal edited',
  loan_vote: 'Loan vote cast',
  loan_appr: 'Loan approved',
  loan_rpy: 'Loan repayment',
  loan_dflt: 'Loan defaulted',
  interest: 'Interest distributed',
  tre_prop: 'Treasury withdrawal proposed',
  tre_vote: 'Treasury vote cast',
  tre_exec: 'Treasury withdrawal executed',
  staked: 'Member staked',
  unstaked: 'Member unstaked',
  name_reg: 'Name registered',
  committed: 'Private vote committed',
  revealed: 'Private vote revealed',
  doc_attn: 'Document attached',
  init: 'DAO initialized',
  admin_add: 'Admin added',
  admin_rem: 'Admin removed',
  threshold: 'Consensus threshold updated',
  policy: 'Loan policy updated',
  paused: 'DAO paused',
  unpaused: 'DAO unpaused',
}

export function eventLabel(symbol: unknown): string {
  const key = String(symbol ?? '').trim()
  if (!key) return 'Unknown event'
  return EVENT_LABELS[key] ?? key
}

// ---------------------------------------------------------------------------
// Proposal enumeration
//
// The contract keeps no queryable list of proposals, so we read the total
// count from the off-chain indexer, then fetch each proposal by id directly
// from the contract (source of truth). In preview mode (no contract / no
// backend) the count is 0 and the lists resolve empty.
// ---------------------------------------------------------------------------

const VOTING_PERIOD = 7 * 24 * 60 * 60
export const PROPOSAL_PAGE_SIZE = 20
export const FETCH_CONCURRENCY = 8

export const tag = (v: unknown): string => String(Array.isArray(v) ? v[0] : v)

/** Map the contract's phase+status onto the UI's numeric ProposalStatus. */
export function loanStatusCode(raw: Record<string, unknown>): number {
  const status = tag(raw.status)
  const phase = tag(raw.phase)
  if (status === 'Approved') return 3
  if (status === 'Executed') return 5
  if (status === 'Rejected' || phase === 'Expired') return 4
  if (phase === 'Voting') return 2
  if (phase === 'Editing') return 1
  return 0
}

export interface UILoanProposal {
  id: number
  borrower: string
  amount: bigint
  purpose: string
  interestRate: number
  status: number
  votesFor: number
  votesAgainst: number
  creationTime: number
  votingStartTime: number
  votingEndTime: number
  isPrivate: boolean
  documentHash: string
  hasVoted: boolean
}

/** `hasVoted` defaults to false for call sites with no voter context (e.g. the
 *  paginated list fetch, which is shared across viewers and isn't scoped to
 *  a connected address). Pass the real value — from `useHasVoted` — wherever
 *  it's actually known for the connected wallet. */
export function mapLoanProposal(raw: Record<string, unknown>, hasVoted = false): UILoanProposal {
  const editingEnd = Number(raw.editing_period_end ?? 0)
  return {
    id: Number(raw.id ?? 0),
    borrower: String(raw.borrower ?? ''),
    amount: asBigInt(raw.amount),
    purpose: '', // not stored on-chain; attach a document hash instead
    interestRate: Number(raw.interest_rate ?? 0),
    status: loanStatusCode(raw),
    votesFor: Number(raw.for_votes ?? 0),
    votesAgainst: Number(raw.against_votes ?? 0),
    creationTime: Number(raw.created_at ?? 0),
    votingStartTime: editingEnd,
    votingEndTime: editingEnd ? editingEnd + VOTING_PERIOD : 0,
    isPrivate: false, // loan proposals are public; treasury proposals can be private
    documentHash: '',
    hasVoted,
  }
}

/** Run `fn` over `items` with at most `limit` calls in flight at once,
 *  settling each independently (unlike Promise.all, one rejection doesn't
 *  fail the whole batch). */
async function settleWithConcurrency<A, B>(
  items: A[],
  limit: number,
  fn: (item: A) => Promise<B>
): Promise<PromiseSettledResult<B>[]> {
  const results: PromiseSettledResult<B>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface ProposalPage<T> {
  items: T[]
  /** true if at least one id in this page failed to fetch and was dropped. */
  hasErrors: boolean
  /** offset to request for the next page, or null once the oldest id (0) has been reached. */
  nextOffset: number | null
}

/** Fetch one page of proposals, walking backwards from `count - 1` so the
 *  newest ids come first. `offset` is how many newest-first proposals prior
 *  pages already covered. */
export async function fetchProposalPage<T>(
  count: number,
  offset: number,
  fetchOne: (id: number) => Promise<Record<string, unknown> | null>,
  map: (raw: Record<string, unknown>) => T,
  pageSize: number = PROPOSAL_PAGE_SIZE
): Promise<ProposalPage<T>> {
  const start = count - 1 - offset
  if (start < 0) return { items: [], hasErrors: false, nextOffset: null }

  const end = Math.max(start - pageSize + 1, 0)
  const ids: number[] = []
  for (let id = start; id >= end; id--) ids.push(id)

  const settled = await settleWithConcurrency(ids, FETCH_CONCURRENCY, fetchOne)

  const items: T[] = []
  let hasErrors = false
  for (const result of settled) {
    if (result.status === 'rejected') {
      hasErrors = true
    } else if (result.value) {
      items.push(map(result.value))
    }
  }

  return { items, hasErrors, nextOffset: end > 0 ? offset + pageSize : null }
}

/** All loan proposals (newest first), read live from the contract, paginated. */
export function useLoanProposals() {
  const { data: stats } = useQuery({
    queryKey: ['backendStats'],
    queryFn: () => backend.getStats(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const count = stats?.totalLoanProposals ?? 0

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['loanProposals', count],
      enabled: isContractConfigured() && count > 0,
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        fetchProposalPage(count, pageParam, (id) => daoRead.getLoanProposal(id), mapLoanProposal),
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    })

  // Memoize so the array keeps a stable identity across renders; consumers use
  // it as an effect/memo dependency and a fresh array each render would loop.
  const proposals = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data])
  const hasErrors = useMemo(() => (data?.pages ?? []).some((p) => p.hasErrors), [data])

  return {
    proposals,
    isLoading,
    count,
    hasMore: !!hasNextPage,
    loadMore: fetchNextPage,
    isLoadingMore: isFetchingNextPage,
    hasErrors,
  }
}

/** Whether the connected wallet has already voted (loan) or at least
 *  committed (private treasury) on the given proposal — read directly from
 *  the contract's `has_voted` view, never inferred from indexer events. */
export function useHasVoted(kind: 'Loan' | 'Treasury', proposalId: number, enabled = true) {
  const { address } = useWallet()
  const { data, refetch } = useQuery({
    queryKey: ['hasVoted', kind, proposalId, address],
    enabled:
      enabled &&
      isContractConfigured() &&
      !!address &&
      Number.isFinite(proposalId) &&
      proposalId >= 0,
    queryFn: () => daoRead.hasVoted(kind, proposalId, address!),
  })
  return { hasVoted: !!data, refetch }
}

/** A single loan proposal by id, including the connected wallet's real
 *  hasVoted state. */
export function useLoanProposal(id: number) {
  const { data, isLoading, refetch: refetchProposal } = useQuery({
    queryKey: ['loanProposal', id],
    enabled: isContractConfigured() && Number.isFinite(id) && id >= 0,
    queryFn: () => daoRead.getLoanProposal(id),
  })
  const { hasVoted, refetch: refetchHasVoted } = useHasVoted('Loan', id)

  const proposal = useMemo(
    () => (data ? mapLoanProposal(data, hasVoted) : null),
    [data, hasVoted]
  )

  const refetch = useCallback(async () => {
    await Promise.all([refetchProposal(), refetchHasVoted()])
  }, [refetchProposal, refetchHasVoted])

  return { proposal, isLoading, refetch }
}

// ---------------------------------------------------------------------------
// Disbursed loans
//
// A LoanProposal only tracks the vote; once approved, the contract disburses
// a separate Loan record carrying the real repayment/due-date state (see
// loans.rs::approve_and_disburse). The contract deliberately reuses the
// proposal's own id for the loan, so `useLoan` and `useLoanProposal` for the
// same id always refer to the same underlying request.
// ---------------------------------------------------------------------------

export interface UILoan {
  id: number
  borrower: string
  principal: bigint
  interestRate: number
  totalRepayment: bigint
  startTime: number
  dueTime: number
  status: 'Active' | 'Repaid' | 'Defaulted'
  amountRepaid: bigint
}

export function mapLoan(raw: Record<string, unknown>): UILoan {
  return {
    id: Number(raw.id ?? 0),
    borrower: String(raw.borrower ?? ''),
    principal: asBigInt(raw.principal),
    interestRate: Number(raw.interest_rate ?? 0),
    totalRepayment: asBigInt(raw.total_repayment),
    startTime: Number(raw.start_time ?? 0),
    dueTime: Number(raw.due_time ?? 0),
    status: tag(raw.status) as UILoan['status'],
    amountRepaid: asBigInt(raw.amount_repaid),
  }
}

/** The disbursed Loan for a given id, once its proposal has been approved.
 *  `enabled` gates the fetch — pass whether the proposal is actually
 *  Approved, since get_loan on a still-pending or rejected proposal id has
 *  nothing to return. */
export function useLoan(id: number, enabled: boolean) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['loan', id],
    enabled: isContractConfigured() && enabled && Number.isFinite(id) && id >= 0,
    queryFn: async () => {
      const raw = await daoRead.getLoan(id)
      return raw ? mapLoan(raw) : null
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  return { loan: data ?? null, isLoading, refetch }
}

export interface UITreasuryProposal {
  id: number
  proposer: string
  title: string
  description: string
  amount: bigint
  recipient: string
  status: number
  votesFor: number
  votesAgainst: number
  creationTime: number
  isPrivate: boolean
  hasVoted: boolean
}

/** See mapLoanProposal's note on `hasVoted` — same default/override contract.
 *  For a private (commit-reveal) proposal the contract's `has_voted` view
 *  reports true as soon as the voter has committed, without distinguishing
 *  that from a fully revealed vote (see `daoRead.hasVoted`); this mapper
 *  passes that same single boolean through rather than inventing a
 *  distinction the contract doesn't expose. */
export function mapTreasuryProposal(raw: Record<string, unknown>, hasVoted = false): UITreasuryProposal {
  const status = tag(raw.status)
  const code = status === 'Executed' ? 5 : status === 'Rejected' ? 4 : 2
  const reason = String(raw.reason ?? '')
  return {
    id: Number(raw.id ?? 0),
    proposer: String(raw.proposer ?? ''),
    title: reason || `Treasury withdrawal #${Number(raw.id ?? 0)}`,
    description: reason,
    amount: asBigInt(raw.amount),
    recipient: String(raw.destination ?? ''),
    status: code,
    votesFor: Number(raw.for_votes ?? 0),
    votesAgainst: Number(raw.against_votes ?? 0),
    creationTime: Number(raw.created_at ?? 0),
    isPrivate: !!raw.private,
    hasVoted,
  }
}

/** All treasury withdrawal proposals (newest first), read live from the contract, paginated. */
export function useTreasuryProposals() {
  const { data: stats } = useQuery({
    queryKey: ['backendStats'],
    queryFn: () => backend.getStats(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const count = stats?.totalTreasuryProposals ?? 0

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['treasuryProposals', count],
      enabled: isContractConfigured() && count > 0,
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        fetchProposalPage(count, pageParam, (id) => daoRead.getTreasuryProposal(id), mapTreasuryProposal),
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    })

  const proposals = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data])
  const hasErrors = useMemo(() => (data?.pages ?? []).some((p) => p.hasErrors), [data])

  return {
    proposals,
    isLoading,
    count,
    hasMore: !!hasNextPage,
    loadMore: fetchNextPage,
    isLoadingMore: isFetchingNextPage,
    hasErrors,
  }
}

// ---------------------------------------------------------------------------
// Staking + treasury write hooks
// ---------------------------------------------------------------------------

/** The connected member's current stake (in token base units). */
export function useStake(): bigint {
  const { address } = useWallet()
  const { data } = useQuery({
    queryKey: ['stake', address],
    enabled: !!address && isContractConfigured(),
    queryFn: () => daoRead.getStake(address!),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  return asBigInt(data)
}

export function useStaking() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const stake = (amount: bigint) => run('Staking', (w) => w.stake(amount))
  const unstake = (amount: bigint) => run('Unstaking', (w) => w.unstake(amount))
  return { stake, unstake, isPending, isSuccess, error }
}

export function useTreasuryVoting() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const voteOnTreasury = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnTreasuryProposal(proposalId, support))
  return { voteOnTreasury, isPending, isSuccess, error }
}

export function useProposeTreasury() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const propose = (
    amount: bigint,
    destination: string,
    reason: string,
    isPrivate: boolean
  ) =>
    run('Proposing withdrawal', (w) =>
      w.proposeTreasuryWithdrawal(amount, destination, reason, isPrivate)
    )
  return { propose, isPending, isSuccess, error }
}

// ---------------------------------------------------------------------------
// Proposal documents (the Filecoin-analog content hash)
//
// The contract stores an opaque byte string per proposal; the convention here
// is that it's a UTF-8 content id (an IPFS CID or digest). We encode on write
// and decode on read.
// ---------------------------------------------------------------------------

export function useProposalDocument(kind: 'Loan' | 'Treasury', id: number) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['document', kind, id],
    enabled: isContractConfigured() && Number.isFinite(id) && id >= 0,
    queryFn: async () => {
      const bytes = await daoRead.getDocument(kind, id)
      return bytes && bytes.length ? new TextDecoder().decode(bytes) : null
    },
  })
  return { cid: data ?? null, isLoading, refetch }
}

export function useAttachDocument() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const attach = (kind: 'Loan' | 'Treasury', proposalId: number, cid: string) =>
    run('Attaching document', (w) =>
      w.attachDocument(kind, proposalId, new TextEncoder().encode(cid.trim()))
    )
  return { attach, isPending, isSuccess, error }
}

// ---------------------------------------------------------------------------
// Admin actions + audit log
//
// The contract enforces admin authorization itself; these just expose the
// entrypoints. A non-admin caller gets a NotAdmin error back from the write,
// surfaced the same way any other failed write is (via the toast in
// useWriteAction).
// ---------------------------------------------------------------------------

export function useAdminActions() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const pause = () => run('Pausing the DAO', (w) => w.pause())
  const unpause = () => run('Unpausing the DAO', (w) => w.unpause())
  const addAdmin = (admin: string) => run('Adding admin', (w) => w.addAdmin(admin))
  const removeAdmin = (admin: string) => run('Removing admin', (w) => w.removeAdmin(admin))
  const setThreshold = (thresholdBps: number) =>
    run('Updating consensus threshold', (w) => w.setConsensusThreshold(thresholdBps))
  return { pause, unpause, addAdmin, removeAdmin, setThreshold, isPending, isSuccess, error }
}

/** The current admin set, read live from the contract. */
export function useAdmins() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admins'],
    enabled: isContractConfigured(),
    queryFn: () => daoRead.getAdmins(),
  })
  return { admins: data ?? [], isLoading, refetch }
}

export interface AdminLogEntry {
  id: string
  symbol: string
  ledger: number
  closedAt: string
  data: unknown
}

function toAdminLogEntry(ev: BackendEvent): AdminLogEntry {
  return { id: ev.id, symbol: ev.symbol, ledger: ev.ledger, closedAt: ev.closed_at, data: ev.data }
}

/** The admin/governance event history (init, admin add/remove, threshold,
 *  policy, pause/unpause), indexed off-chain since the contract keeps no
 *  queryable log of its own admin actions. */
export function useAdminLog(limit = 50) {
  const { data, isLoading } = useQuery({
    queryKey: ['adminLog', limit],
    queryFn: () => backend.getAdminLog(limit),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const entries = useMemo(() => (data ?? []).map(toAdminLogEntry), [data])
  return { entries, isLoading }
}
