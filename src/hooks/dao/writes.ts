'use client'

import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import React from 'react'
import toast from 'react-hot-toast'
import { useWallet } from '@/lib/wallet'
import { getTransactionUrl } from '@/lib/stellar'
import { daoWrite, InvokeError, type InvokeResult } from '@/lib/dao-client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A transaction confirmed via invoke()'s getTransaction poll is final on the
// ledger, but a simulateTransaction call issued immediately after can still
// land on an RPC node whose view of that ledger hasn't caught up yet — which
// reads back as pre-transaction state and looks like the write silently
// failed. This short delay before invalidating gives that propagation a
// window to close; it's a mitigation; not tested against a live testnet
// contract (see PR description), so revisit if staleness is still observed.
const RPC_PROPAGATION_DELAY_MS = 500

/**
 * Shared plumbing for a write action: resolves the wallet + signer, tracks
 * pending/success/error, surfaces toasts, and invalidates the query keys the
 * action affects once the write is confirmed. A failed write invalidates
 * nothing — the cache should only move once the chain actually has.
 */
function useWriteAction() {
  const { address, signXDR, isConnected } = useWallet()
  const queryClient = useQueryClient()
  const [isPending, setPending] = useState(false)
  const [isSuccess, setSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Surfaced separately from `error` so a caller can offer a "Try again"
  // affordance without having to `instanceof`-check the error itself (#58).
  const [isRetryable, setRetryable] = useState(false)

  const run = useCallback(
    async (
      label: string,
      fn: (w: ReturnType<typeof daoWrite>) => Promise<InvokeResult>,
      invalidates: QueryKey[] = []
    ) => {
      if (!isConnected || !address) {
        toast.error('Connect your wallet first')
        throw new Error('Wallet not connected')
      }
      setPending(true)
      setSuccess(false)
      setError(null)
      setRetryable(false)
      const toastId = toast.loading(`${label}…`)
      try {
        const res = await fn(daoWrite(address, signXDR))
        setSuccess(true)
        toast.success(
          React.createElement(
            'span',
            null,
            `${label} confirmed `,
            React.createElement(
              'a',
              {
                href: getTransactionUrl(res.hash),
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'underline',
              },
              'View transaction'
            )
          ),
          { id: toastId, duration: 8000 }
        )
        if (invalidates.length) {
          await sleep(RPC_PROPAGATION_DELAY_MS)
          await Promise.all(
            invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
          )
        }
        return res
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        const retryable = e instanceof InvokeError && e.retryable
        setError(e)
        setRetryable(retryable)
        toast.error(
          retryable ? `${label} failed: ${e.message} You can try again.` : `${label} failed: ${e.message}`,
          { id: toastId }
        )
        throw e
      } finally {
        setPending(false)
      }
    },
    [address, isConnected, signXDR, queryClient]
  )

  return { run, isPending, isSuccess, error, isRetryable, address }
}

export function useMemberRegistration() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  const registerMember = () =>
    run('Registering membership', (w) => w.registerMember(), [
      ['userData', address],
      ['daoStats'],
    ])
  return { registerMember, isPending, error, isSuccess }
}

export function useLoanRequest() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  // Returns the new proposal's id (request_loan's on-chain return value) so
  // callers can immediately attach a supporting document to it.
  const requestLoan = (amount: bigint) =>
    run('Requesting loan', (w) => w.requestLoan(amount), [['backendStats']]).then(
      (res) => Number(res.returnValue)
    )
  return { requestLoan, isPending, error, isSuccess }
}

export function useVoting() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  const voteOnProposal = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnLoanProposal(proposalId, support), [
      ['loanProposal', proposalId],
      ['loanProposals'],
      ['hasVoted', 'Loan', proposalId, address],
      // A vote can push a proposal past quorum and trigger disbursement in
      // the same transaction, moving the treasury balance.
      ['daoStats'],
    ])
  return { voteOnProposal, isPending, error, isSuccess }
}

export function useLoanRepayment() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  // repay_loan collects the entire outstanding balance (total_repayment -
  // amount_repaid) in one shot; repay_loan_partial takes an explicit amount
  // which the contract applies to accrued interest first, then principal.
  const repayLoan = (loanId: number, amount?: bigint) => {
    if (amount !== undefined) {
      if (amount <= BigInt(0)) throw new Error('Repayment amount must be greater than zero')
      return run('Repaying loan', (w) => w.repayLoanPartial(loanId, amount), [
        ['loan', loanId],
        ['userData', address],
        ['daoStats'],
      ])
    }
    return run('Repaying loan', (w) => w.repayLoan(loanId), [
      ['loan', loanId],
      ['userData', address],
      ['daoStats'],
    ])
  }
  const repayLoanPartial = (loanId: number, amount: bigint) => {
    if (amount <= BigInt(0)) throw new Error('Repayment amount must be greater than zero')
    return run('Repaying loan', (w) => w.repayLoanPartial(loanId, amount), [
      ['loan', loanId],
      ['userData', address],
      ['daoStats'],
    ])
  }
  return { repayLoan, repayLoanPartial, isPending, error, isSuccess }
}

export function useMarkLoanDefaulted() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  // Permissionless: mark_loan_defaulted takes no caller argument, so this
  // works even for a connected wallet that isn't the borrower or an admin.
  // The borrower's own member record changes too, but that's a different
  // address than whoever calls this — out of reach for this client's cache,
  // and covered by their own next poll like any other member's actions.
  const markLoanDefaulted = (loanId: number) =>
    run('Marking loan defaulted', (w) => w.markLoanDefaulted(loanId), [['loan', loanId]])
  return { markLoanDefaulted, isPending, error, isSuccess }
}

export function useRewards() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  const claimRewards = () =>
    run('Claiming rewards', (w) => w.claimRewards(), [['userData', address]])
  const claimYield = () =>
    run('Claiming yield', (w) => w.claimRewards(), [['userData', address]])
  return { claimRewards, claimYield, isPending, error, isSuccess }
}

// ---------------------------------------------------------------------------
// Staking + treasury write hooks
// ---------------------------------------------------------------------------

export function useStaking() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  const stake = (amount: bigint) =>
    run('Staking', (w) => w.stake(amount), [['stake', address], ['daoStats']])
  const unstake = (amount: bigint) =>
    run('Unstaking', (w) => w.unstake(amount), [['stake', address], ['daoStats']])
  return { stake, unstake, isPending, isSuccess, error }
}

export function useTreasuryVoting() {
  const { run, isPending, isSuccess, error, address } = useWriteAction()
  const voteOnTreasury = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnTreasuryProposal(proposalId, support), [
      ['treasuryProposals'],
      ['hasVoted', 'Treasury', proposalId, address],
      // A vote can push a proposal past quorum and execute the withdrawal in
      // the same transaction, moving the treasury balance.
      ['daoStats'],
    ])
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
    run(
      'Proposing withdrawal',
      (w) => w.proposeTreasuryWithdrawal(amount, destination, reason, isPrivate),
      [['backendStats']]
    )
  return { propose, isPending, isSuccess, error }
}

// ---------------------------------------------------------------------------
// Proposal documents (the Filecoin-analog content hash)
//
// The contract stores an opaque byte string per proposal; the convention here
// is that it's a UTF-8 content id (an IPFS CID or digest). We encode on
// write (decoding on read is the read hook's job).
// ---------------------------------------------------------------------------

export function useAttachDocument() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const attach = (kind: 'Loan' | 'Treasury', proposalId: number, cid: string) =>
    run(
      'Attaching document',
      (w) => w.attachDocument(kind, proposalId, new TextEncoder().encode(cid.trim())),
      [['document', kind, proposalId]]
    )
  return { attach, isPending, isSuccess, error }
}

// ---------------------------------------------------------------------------
// Admin actions
//
// The contract enforces admin authorization itself; these just expose the
// entrypoints. A non-admin caller gets a NotAdmin error back from the write,
// surfaced the same way any other failed write is (via the toast in
// useWriteAction).
// ---------------------------------------------------------------------------

export function useAdminActions() {
  const { run, isPending, isSuccess, error } = useWriteAction()
  const pause = () => run('Pausing the DAO', (w) => w.pause(), [['daoStats']])
  const unpause = () => run('Unpausing the DAO', (w) => w.unpause(), [['daoStats']])
  // The admin log itself is backend-indexed (not read directly off-chain),
  // so it isn't invalidated here — the indexer needs to have processed the
  // event first, which the existing poll already covers.
  const addAdmin = (admin: string) => run('Adding admin', (w) => w.addAdmin(admin), [['admins']])
  const removeAdmin = (admin: string) =>
    run('Removing admin', (w) => w.removeAdmin(admin), [['admins']])
  const setThreshold = (thresholdBps: number) =>
    run('Updating consensus threshold', (w) => w.setConsensusThreshold(thresholdBps), [
      ['daoStats'],
    ])
  return { pause, unpause, addAdmin, removeAdmin, setThreshold, isPending, isSuccess, error }
}
