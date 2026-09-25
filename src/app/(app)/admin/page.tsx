'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ShieldCheckIcon,
  UsersIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import {
  useUserData,
  useDAOStats,
  useAdmins,
  useAdminActions,
  useAdminLog,
} from '@/hooks/useDAO'
import { formatToken, formatAddress, formatDate, formatThreshold } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/skeleton'
import { isStellarAddress } from '@/lib/stellar'
import { PageHeader } from '@/components/PageHeader'

type Tab = 'overview' | 'governance' | 'activity'

const TABS: { id: Tab; name: string; icon: ReactNode }[] = [
  { id: 'overview', name: 'Overview', icon: <ChartBarIcon className="h-4 w-4" /> },
  { id: 'governance', name: 'Governance', icon: <UsersIcon className="h-4 w-4" /> },
  { id: 'activity', name: 'Activity Log', icon: <ClockIcon className="h-4 w-4" /> },
]

export default function AdminPage() {
  const userData = useUserData()
  const stats = useDAOStats()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  if (!userData.isConnected) {
    return (
      <GuardMessage
        icon={<ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 dark:text-yellow-400 mx-auto mb-4" />}
        title="Wallet Not Connected"
        message="Please connect your wallet to access the admin panel."
      />
    )
  }

  if (userData.isLoading) {
    // Same "not yet known" collapse as isMember (#69) — isAdmin reads false
    // until the query resolves, which would otherwise flash "Access Denied"
    // at real admins on every load. No AppShell wrapper needed — the (app)
    // route-group layout already provides it.
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!userData.isAdmin) {
    return (
      <GuardMessage
        icon={<ExclamationTriangleIcon className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto mb-4" />}
        title="Access Denied"
        message="You need admin privileges to access this panel."
      />
    )
  }

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Real-time DAO governance and system state." />
      <div className="max-w-7xl mx-auto">
        <div className="bg-card rounded-lg shadow border border-border">
          <div className="border-b border-border">
            <nav className="flex space-x-8 px-6">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 text-sm font-medium border-b-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="p-6">
            {activeTab === 'overview' && <OverviewTab stats={stats} />}
            {activeTab === 'governance' && <GovernanceTab stats={stats} />}
            {activeTab === 'activity' && <ActivityTab />}
          </div>
        </div>
      </div>
    </>
  )
}

function GuardMessage({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="bg-card rounded-lg p-6 text-center">
        {icon}
        <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-lg p-6 border border-border">
      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
      <div className="text-2xl font-bold mt-2 text-foreground">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function OverviewTab({ stats }: { stats: ReturnType<typeof useDAOStats> }) {
  const { pause, unpause, isPending } = useAdminActions()

  return (
    <div className="space-y-6">
      <div
        className={`rounded-lg p-6 border ${
          stats.isPaused ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900' : 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${stats.isPaused ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'}`}>
              <ShieldCheckIcon className={`h-6 w-6 ${stats.isPaused ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${stats.isPaused ? 'text-red-900 dark:text-red-300' : 'text-green-900 dark:text-green-300'}`}>
                Contract is {stats.isPaused ? 'Paused' : 'Active'}
              </h3>
              <p className={`text-sm ${stats.isPaused ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                {stats.isPaused
                  ? 'All state-changing operations are currently blocked on-chain.'
                  : 'Members can register, vote, and transact normally.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (stats.isPaused) {
                if (!window.confirm('Unpause the DAO? This will re-enable all state-changing operations for every member.')) return
                unpause()
              } else {
                if (!window.confirm('Pause the DAO? This will halt new loans, votes, and proposals for every member immediately.')) return
                pause()
              }
            }}
            disabled={isPending}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-white disabled:opacity-50 ${
              stats.isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {stats.isPaused ? <PlayIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
            <span>{stats.isPaused ? 'Unpause' : 'Pause'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Active Members" value={stats.activeMembers.toLocaleString()} sub={`${stats.totalMembers} total ever joined`} />
        <StatCard label="Active Loans" value={stats.activeLoans.toLocaleString()} sub={`${stats.totalLoans} total`} />
        <StatCard label="Treasury Balance" value={formatToken(stats.treasuryBalance)} />
        <StatCard label="Consensus Threshold" value={formatThreshold(stats.consensusThreshold)} />
      </div>
    </div>
  )
}

function GovernanceTab({ stats }: { stats: ReturnType<typeof useDAOStats> }) {
  const { admins, isLoading, refetch } = useAdmins()
  const { addAdmin, removeAdmin, setThreshold, isPending, isSuccess } = useAdminActions()
  const [newAdmin, setNewAdmin] = useState('')
  const [threshold, setThresholdInput] = useState('')

  // Same class of input as the governance proposal form's destination
  // address, validated against the same shared predicate before a
  // transaction is ever built — granting admin rights is among the
  // highest-stakes actions in the app and deserves at least what the
  // withdrawal-adjacent form already has (#66).
  const trimmedNewAdmin = newAdmin.trim()
  const newAdminError = trimmedNewAdmin.length > 0 && !isStellarAddress(trimmedNewAdmin)

  const submitAddAdmin = async (e: FormEvent) => {
    e.preventDefault()
    if (!trimmedNewAdmin || !isStellarAddress(trimmedNewAdmin)) return
    if (!window.confirm(`Add ${formatAddress(trimmedNewAdmin)} as an admin? This grants full admin privileges.`)) return
    await addAdmin(trimmedNewAdmin)
    setNewAdmin('')
    refetch()
  }

  const submitThreshold = async (e: FormEvent) => {
    e.preventDefault()
    const bps = Number(threshold)
    if (!Number.isFinite(bps) || bps <= 0 || bps > 10_000) return
    if (!window.confirm(`Update consensus threshold from ${formatThreshold(stats.consensusThreshold)} to ${formatThreshold(bps)}? This changes the approval bar for every open proposal.`)) return
    await setThreshold(bps)
    setThresholdInput('')
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Admins ({admins.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {isLoading && <div className="px-6 py-4 text-sm text-muted-foreground">Loading…</div>}
          {admins.map((addr) => (
            <div key={addr} className="px-6 py-3 flex items-center justify-between">
              <span className="font-mono text-sm text-foreground">{formatAddress(addr)}</span>
              <button
                onClick={async () => {
                  if (!window.confirm(`Remove admin ${formatAddress(addr)}? This action requires a remaining admin to re-add them.`)) return
                  await removeAdmin(addr)
                  refetch()
                }}
                disabled={isPending || admins.length <= 1}
                title={admins.length <= 1 ? 'Cannot remove the last admin' : 'Remove admin'}
                className="flex items-center space-x-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Remove</span>
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={submitAddAdmin} className="p-6 flex items-start space-x-2 border-t border-border">
          <div className="flex-1">
            <input
              type="text"
              value={newAdmin}
              onChange={(e) => setNewAdmin(e.target.value)}
              placeholder="G… address to add as admin"
              aria-invalid={newAdminError}
              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-muted dark:text-foreground"
            />
            {newAdminError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Enter a valid Stellar destination address (G… or C…)
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || !trimmedNewAdmin || !isStellarAddress(trimmedNewAdmin)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Add Admin
          </button>
        </form>
      </div>

      <div className="bg-card rounded-lg border border-border">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Consensus Threshold</h3>
          <p className="text-sm text-muted-foreground">
            Currently {formatThreshold(stats.consensusThreshold)} of active members, in basis points.
          </p>
        </div>
        <form onSubmit={submitThreshold} className="p-6 flex space-x-2">
          <input
            type="number"
            min={1}
            max={10_000}
            value={threshold}
            onChange={(e) => setThresholdInput(e.target.value)}
            placeholder="e.g. 5100 for 51%"
            className="flex-1 px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-muted dark:text-foreground"
          />
          <button
            type="submit"
            disabled={isPending || !threshold}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Update Threshold
          </button>
        </form>
        {isSuccess && <p className="px-6 pb-4 text-sm text-green-600 dark:text-green-400">Updated.</p>}
      </div>
    </div>
  )
}

function ActivityTab() {
  const { entries, isLoading } = useAdminLog(100)

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">
          Admin/Governance Event History
        </h3>
        <p className="text-sm text-muted-foreground">
          Indexed on-chain events: admin add/remove, threshold and policy changes, pause/unpause.
        </p>
      </div>
      <div className="divide-y divide-border">
        {isLoading && <div className="px-6 py-4 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && entries.length === 0 && (
          <div className="px-6 py-8 text-center text-muted-foreground">
            No admin/governance events indexed yet.
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="px-2 py-1 text-xs font-mono bg-muted text-foreground rounded">
                {entry.symbol}
              </span>
              <span className="text-sm text-foreground">Ledger {entry.ledger}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(entry.closedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
