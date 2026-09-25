'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BanknotesIcon,
  LockClosedIcon,
  ArrowTrendingUpIcon,
  GiftIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  XMarkIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline'
import {
  useUserData,
  useDAOStats,
  useStake,
  useStaking,
  useTreasuryProposals,
  useTreasuryVoting,
  useHasVoted,
  type UITreasuryProposal,
} from '@/hooks/useDAO'
import { formatToken, parseToken } from '@/lib/utils'
import { formatStellarAddress } from '@/lib/stellar'
import { PROPOSAL_STATUS_LABELS } from '@/constants'

function TreasuryProposalRow({
  proposal: p,
  canVote,
  voting,
  onVote,
}: {
  proposal: UITreasuryProposal
  canVote: boolean
  voting: boolean
  onVote: (proposalId: number, support: boolean) => Promise<unknown>
}) {
  const { hasVoted, refetch } = useHasVoted('Treasury', p.id, p.status === 2 && !p.isPrivate)

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{p.title}</p>
            {p.isPrivate && (
              <Badge variant="secondary" className="text-xs">
                Private
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatToken(p.amount)} → {formatStellarAddress(p.recipient)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            For {p.votesFor} · Against {p.votesAgainst}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              p.status === 5
                ? 'default'
                : p.status === 4
                  ? 'destructive'
                  : p.status === PROPOSAL_STATUS_AWAITING_FUNDS
                    ? 'outline'
                    : 'secondary'
            }
          >
            {PROPOSAL_STATUS_LABELS[p.status as keyof typeof PROPOSAL_STATUS_LABELS]}
          </Badge>
          {canVote && p.status === 2 && !p.isPrivate && !hasVoted && (
            <div className="flex gap-1" role="group" aria-label="Vote">
              <Button
                size="sm"
                variant="outline"
                disabled={voting}
                onClick={async () => {
                  await onVote(p.id, true)
                  refetch()
                }}
                aria-label="Vote for"
              >
                <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={voting}
                onClick={async () => {
                  await onVote(p.id, false)
                  refetch()
                }}
                aria-label="Vote against"
              >
                <XMarkIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              </Button>
            </div>
          )}
          {canVote && p.status === 2 && !p.isPrivate && hasVoted && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              You&apos;ve voted
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string
  value: string
  icon: typeof BanknotesIcon
  tint: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${tint}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function TreasuryPage() {
  const userData = useUserData()
  const stats = useDAOStats()
  const myStake = useStake()
  const { stake, unstake, isPending: staking } = useStaking()
  const { proposals, isLoading, hasMore, loadMore, isLoadingMore, hasErrors } = useTreasuryProposals()
  const { voteOnTreasury, isPending: voting } = useTreasuryVoting()

  const [amount, setAmount] = useState('')

  if (!userData.isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <BanknotesIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium text-foreground">
              Connect Your Wallet
            </h3>
            <p className="text-muted-foreground">
              Please connect your wallet to access the treasury.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleStake = async () => {
    const base = parseToken(amount)
    if (base <= BigInt(0)) return
    try {
      await stake(base)
      setAmount('')
    } catch {
      /* toast handled in hook */
    }
  }

  const handleUnstake = async () => {
    const base = parseToken(amount)
    if (base <= BigInt(0)) return
    try {
      await unstake(base)
      setAmount('')
    } catch {
      /* toast handled in hook */
    }
  }

  const canVote = userData.isMember

  return (
    <>
      <PageHeader
        title="Treasury & Staking"
        subtitle="DAO funds, member staking, and treasury withdrawals"
      />
      {/* Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Treasury Balance"
          value={formatToken(stats.treasuryBalance)}
          icon={BuildingLibraryIcon}
          tint="bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400"
        />
        <StatCard
          label="Total Staked"
          value={formatToken(stats.totalRestaked)}
          icon={LockClosedIcon}
          tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
        />
        <StatCard
          label="Your Stake"
          value={formatToken(myStake)}
          icon={ArrowTrendingUpIcon}
          tint="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
        />
        <StatCard
          label="Pending Yield"
          value={formatToken(userData.pendingYield)}
          icon={GiftIcon}
          tint="bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Staking */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockClosedIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Staking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Stake tokens to boost your voting weight. Staked funds are held
              separately from the treasury and can be withdrawn at any time.
            </p>
            <div>
              <label htmlFor="stake-amount" className="mb-1 block text-sm font-medium text-foreground">
                Amount
              </label>
              <input
                id="stake-amount"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={!userData.isMember || staking}
                className="w-full rounded-lg border border-input px-3 py-2.5 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-muted"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleStake}
                disabled={!userData.isMember || staking || !amount}
                className="flex-1"
              >
                <ArrowUpTrayIcon className="mr-2 h-4 w-4" />
                Stake
              </Button>
              <Button
                variant="outline"
                onClick={handleUnstake}
                disabled={!userData.isMember || staking || !amount}
                className="flex-1"
              >
                <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
                Unstake
              </Button>
            </div>
            {!userData.isMember && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                You must be a DAO member to stake.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Treasury proposals */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BanknotesIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              Treasury Withdrawals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasErrors && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
                Some treasury proposals couldn&apos;t be loaded and are missing from this list. Try again shortly.
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="skeleton h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : proposals.length === 0 ? (
              <div className="py-10 text-center">
                <BanknotesIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No treasury withdrawals yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {proposals.map((p) => (
                  <TreasuryProposalRow
                    key={p.id}
                    proposal={p}
                    canVote={canVote}
                    voting={voting}
                    onVote={voteOnTreasury}
                  />
                ))}
              </ul>
            )}
            {!isLoading && hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => loadMore()} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
