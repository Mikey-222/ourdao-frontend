'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  UsersIcon,
  UserGroupIcon,
  ScaleIcon,
  DocumentTextIcon,
  DocumentPlusIcon,
  CheckIcon,
  XMarkIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import {
  useUserData,
  useDAOStats,
  useLoanProposals,
  useTreasuryProposals,
  useVoting,
  useTreasuryVoting,
  useHasVoted,
  type UILoanProposal,
  type UITreasuryProposal,
} from '@/hooks/useDAO'
import { formatToken, formatAddress, formatThreshold } from '@/lib/utils'
import { PROPOSAL_STATUS_LABELS } from '@/constants'

function StatusBadge({ status }: { status: number }) {
  const variant =
    status === 3 || status === 5
      ? 'default'
      : status === 4
        ? 'destructive'
        : 'secondary'
  return (
    <Badge variant={variant}>
      {PROPOSAL_STATUS_LABELS[status as keyof typeof PROPOSAL_STATUS_LABELS]}
    </Badge>
  )
}

function VoteButtons({
  disabled,
  onVote,
}: {
  disabled: boolean
  onVote: (support: boolean) => void
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Vote">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onVote(true)} aria-label="Vote for">
        <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onVote(false)} aria-label="Vote against">
        <XMarkIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
      </Button>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <DocumentTextIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  )
}

function AlreadyVotedLabel() {
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      You&apos;ve voted
    </div>
  )
}

function LoanProposalRow({
  proposal: p,
  canVote,
  votingLoan,
  onVote,
}: {
  proposal: UILoanProposal
  canVote: boolean
  votingLoan: boolean
  onVote: (proposalId: number, support: boolean) => Promise<unknown>
}) {
  const { hasVoted, refetch } = useHasVoted('Loan', p.id, p.status === 2)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-4">
      <div className="min-w-0">
        <Link
          href={`/loans/${p.id}`}
          className="font-medium text-foreground hover:text-primary-700 dark:hover:text-primary-400"
        >
          Loan Proposal #{p.id}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatToken(p.amount)} · {(p.interestRate / 100).toFixed(1)}% ·{' '}
          {formatAddress(p.borrower)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          For {p.votesFor} · Against {p.votesAgainst}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={p.status} />
        {canVote && p.status === 2 && !hasVoted && (
          <VoteButtons
            disabled={votingLoan}
            onVote={async (s) => {
              await onVote(p.id, s)
              refetch()
            }}
          />
        )}
        {canVote && p.status === 2 && hasVoted && <AlreadyVotedLabel />}
      </div>
    </li>
  )
}

function TreasuryProposalRow({
  proposal: p,
  canVote,
  votingTreasury,
  onVote,
}: {
  proposal: UITreasuryProposal
  canVote: boolean
  votingTreasury: boolean
  onVote: (proposalId: number, support: boolean) => Promise<unknown>
}) {
  const { hasVoted, refetch } = useHasVoted('Treasury', p.id, p.status === 2 && !p.isPrivate)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-4">
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
          {formatToken(p.amount)} → {formatAddress(p.recipient)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          For {p.votesFor} · Against {p.votesAgainst}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={p.status} />
        {canVote && p.status === 2 && !p.isPrivate && !hasVoted && (
          <VoteButtons
            disabled={votingTreasury}
            onVote={async (s) => {
              await onVote(p.id, s)
              refetch()
            }}
          />
        )}
        {canVote && p.status === 2 && !p.isPrivate && hasVoted && <AlreadyVotedLabel />}
      </div>
    </li>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-20 w-full rounded-lg" />
      ))}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string
  value: string | number
  icon: typeof UsersIcon
  tint: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${tint}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function GovernancePage() {
  const userData = useUserData()
  const stats = useDAOStats()
  const {
    proposals: loanProposals,
    isLoading: loadingLoans,
    hasMore: hasMoreLoans,
    loadMore: loadMoreLoans,
    isLoadingMore: loadingMoreLoans,
    hasErrors: loanErrors,
  } = useLoanProposals()
  const {
    proposals: treasuryProposals,
    isLoading: loadingTreasury,
    hasMore: hasMoreTreasury,
    loadMore: loadMoreTreasury,
    isLoadingMore: loadingMoreTreasury,
    hasErrors: treasuryErrors,
  } = useTreasuryProposals()
  const { voteOnProposal, isPending: votingLoan } = useVoting()
  const { voteOnTreasury, isPending: votingTreasury } = useTreasuryVoting()

  if (!userData.isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <ScaleIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium text-foreground">
              Connect Your Wallet
            </h3>
            <p className="text-muted-foreground">
              Please connect your wallet to access governance.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const thresholdPct = formatThreshold(stats.consensusThreshold || 0)
  const openProposals =
    loanProposals.filter((p) => p.status === 2).length +
    treasuryProposals.filter((p) => p.status === 2).length

  return (
    <>
      <PageHeader
        title="Governance"
        subtitle="Vote on loan requests and treasury withdrawals"
        actions={
          userData.isMember ? (
            <Button asChild size="sm">
              <Link href="/governance/create">
                <DocumentPlusIcon className="mr-2 h-4 w-4" />
                Create Proposal
              </Link>
            </Button>
          ) : undefined
        }
      />
      {/* Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Members"
          value={stats.totalMembers}
          icon={UsersIcon}
          tint="bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400"
        />
        <StatCard
          label="Active Members"
          value={stats.activeMembers}
          icon={UserGroupIcon}
          tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
        />
        <StatCard
          label="Consensus Threshold"
          value={thresholdPct}
          icon={ScaleIcon}
          tint="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
        />
        <StatCard
          label="Open Proposals"
          value={openProposals}
          icon={DocumentTextIcon}
          tint="bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400"
        />
      </div>

      <Tabs defaultValue="loans" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="loans">Loan Proposals</TabsTrigger>
          <TabsTrigger value="treasury">Treasury</TabsTrigger>
        </TabsList>

        {/* Loan proposals */}
        <TabsContent value="loans" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BanknotesIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Loan Proposals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loanErrors && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
                  Some loan proposals couldn&apos;t be loaded and are missing from this list. Try again shortly.
                </div>
              )}
              {loadingLoans ? (
                <LoadingRows />
              ) : loanProposals.length === 0 ? (
                <EmptyState label="No loan proposals yet." />
              ) : (
                <ul className="divide-y divide-border">
                  {loanProposals.map((p) => (
                    <LoanProposalRow
                      key={p.id}
                      proposal={p}
                      canVote={userData.isMember}
                      votingLoan={votingLoan}
                      onVote={voteOnProposal}
                    />
                  ))}
                </ul>
              )}
              {!loadingLoans && hasMoreLoans && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => loadMoreLoans()} disabled={loadingMoreLoans}>
                    {loadingMoreLoans ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treasury proposals */}
        <TabsContent value="treasury" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BanknotesIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Treasury Withdrawals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {treasuryErrors && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
                  Some treasury proposals couldn&apos;t be loaded and are missing from this list. Try again shortly.
                </div>
              )}
              {loadingTreasury ? (
                <LoadingRows />
              ) : treasuryProposals.length === 0 ? (
                <EmptyState label="No treasury withdrawals yet." />
              ) : (
                <ul className="divide-y divide-border">
                  {treasuryProposals.map((p) => (
                    <TreasuryProposalRow
                      key={p.id}
                      proposal={p}
                      canVote={userData.isMember}
                      votingTreasury={votingTreasury}
                      onVote={voteOnTreasury}
                    />
                  ))}
                </ul>
              )}
              {!loadingTreasury && hasMoreTreasury && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => loadMoreTreasury()} disabled={loadingMoreTreasury}>
                    {loadingMoreTreasury ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
