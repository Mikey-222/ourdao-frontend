'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useWallet } from '@/lib/wallet'
import { isContractConfigured } from '@/lib/stellar'
import { daoRead } from '@/lib/dao-client'
import { backend } from '@/lib/backend'
import { asBigInt, mapLoanProposal, mapLoan, mapTreasuryProposal, toAdminLogEntry, type UILoan } from '@/lib/dao-mappers'
import { fetchProposalPage } from './enumeration'

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

/** The disbursed Loan for a given id, once its proposal has been approved.
 *  `enabled` gates the fetch — pass whether the proposal is actually
 *  Approved, since get_loan on a still-pending or rejected proposal id has
 *  nothing to return. See src/lib/dao-mappers.ts for why a loan and its
 *  originating proposal share the same id. */
export function useLoan(id: number, enabled: boolean) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['loan', id],
    enabled: isContractConfigured() && enabled && Number.isFinite(id) && id >= 0,
    queryFn: async (): Promise<UILoan | null> => {
      const raw = await daoRead.getLoan(id)
      return raw ? mapLoan(raw) : null
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  return { loan: data ?? null, isLoading, refetch }
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

// ---------------------------------------------------------------------------
// Proposal documents (the Filecoin-analog content hash)
//
// The contract stores an opaque byte string per proposal; the convention here
// is that it's a UTF-8 content id (an IPFS CID or digest). We decode on read
// (encoding on write is the write hook's job).
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

/** The current admin set, read live from the contract. */
export function useAdmins() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admins'],
    enabled: isContractConfigured(),
    queryFn: () => daoRead.getAdmins(),
  })
  return { admins: data ?? [], isLoading, refetch }
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
