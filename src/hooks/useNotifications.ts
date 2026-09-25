'use client'

/**
 * Backend-backed notification/activity hooks. Notifications are scoped to the
 * connected wallet; the activity feed is the DAO-wide indexed event stream.
 *
 * Marking-as-read is persisted via the backend's mutation endpoints; removal
 * stays client-side only since there's no delete endpoint.
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@/lib/wallet'
import { backend, type BackendEvent, type BackendNotification } from '@/lib/backend'
import { formatStellarAddress, isStellarAddress } from '@/lib/stellar'
import type { ActivityItem, NotificationData } from '@/lib/pushNotifications'

const POLL_MS = 15_000

function toNotification(n: BackendNotification): NotificationData {
  return {
    id: String(n.id),
    title: n.title,
    message: n.message,
    type: n.type,
    timestamp: new Date(n.created_at),
    read: n.read,
  }
}

/**
 * Notifications for the connected member, polled from the indexer. Read/removed
 * state is layered on top locally. The listening/auto controls are retained for
 * API compatibility with the previous mock hook but are effectively always-on
 * (the query polls regardless).
 */
export function useAutoNotifications() {
  const { address } = useWallet()
  const queryClient = useQueryClient()
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ['notifications', address],
    enabled: !!address,
    queryFn: () => backend.getNotifications(address!),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  })

  const notifications = useMemo<NotificationData[]>(() => {
    return (data ?? [])
      .map(toNotification)
      .filter((n) => !removedIds.has(n.id))
      .map((n) => (readIds.has(n.id) ? { ...n, read: true } : n))
  }, [data, readIds, removedIds])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  // Optimistic local flip so the UI updates instantly; the backend call
  // persists it, and a refetch reconciles with the indexed state.
  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((prev) => new Set(prev).add(id))
      const numericId = Number(id)
      if (Number.isFinite(numericId)) {
        backend.markNotificationRead(numericId).then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications', address] })
        })
      }
    },
    [queryClient, address]
  )

  const markAllAsRead = useCallback(() => {
    setReadIds(new Set((data ?? []).map((n) => String(n.id))))
    if (address) {
      backend.markAllNotificationsRead(address).then(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications', address] })
      })
    }
  }, [data, address, queryClient])

  const removeNotification = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setRemovedIds(new Set((data ?? []).map((n) => String(n.id))))
  }, [data])

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch (err) {
        console.warn('Notification permission request failed:', err)
      }
    }
  }, [])

  const noop = useCallback(() => {}, [])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
    requestPermission,
    // Compatibility surface — data is polled continuously, so "listening" is on.
    enableAutoNotifications: noop,
    disableAutoNotifications: noop,
    autoNotifyEnabled: true,
    startListening: noop,
    stopListening: noop,
    isListening: !!address,
  }
}

// Map a raw contract event symbol to an activity category + label.
const ACTIVITY_META: Record<string, { type: ActivityItem['type']; title: string; description: string }> = {
  joined: { type: 'member', title: 'New member joined', description: 'A member joined the DAO' },
  exited: { type: 'member', title: 'Member exited', description: 'A member withdrew their share' },
  claimed: { type: 'treasury', title: 'Yield claimed', description: 'A member claimed rewards' },
  loan_req: { type: 'loan', title: 'Loan requested', description: 'A new loan proposal was opened' },
  loan_edit: { type: 'loan', title: 'Loan proposal edited', description: 'A loan proposal was updated' },
  loan_vote: { type: 'vote', title: 'Vote cast', description: 'A vote was cast on a loan proposal' },
  loan_appr: { type: 'loan', title: 'Loan approved', description: 'A loan was approved and disbursed' },
  loan_rej: { type: 'loan', title: 'Loan rejected', description: 'A loan proposal can no longer reach quorum' },
  loan_wait: { type: 'loan', title: 'Loan awaiting funds', description: 'A loan was approved but the treasury is too small to disburse it — top up the treasury' },
  loan_rpy: { type: 'loan', title: 'Loan repayment', description: 'A loan repayment was received' },
  interest: { type: 'treasury', title: 'Interest distributed', description: 'Loan interest was distributed to members' },
  tre_prop: { type: 'treasury', title: 'Treasury proposal', description: 'A treasury withdrawal was proposed' },
  tre_vote: { type: 'vote', title: 'Vote cast', description: 'A vote was cast on a treasury proposal' },
  tre_exec: { type: 'treasury', title: 'Treasury withdrawal executed', description: 'A treasury withdrawal was executed' },
  tre_rej: { type: 'treasury', title: 'Treasury proposal rejected', description: 'A treasury withdrawal was rejected' },
  tre_wait: { type: 'treasury', title: 'Treasury withdrawal awaiting funds', description: 'A treasury withdrawal was approved but the treasury is too small to execute it — top up the treasury' },
  staked: { type: 'treasury', title: 'Member staked', description: 'A member staked for voting weight' },
  unstaked: { type: 'treasury', title: 'Member unstaked', description: 'A member reduced their stake' },
  name_reg: { type: 'member', title: 'Name registered', description: 'A member registered a name' },
  committed: { type: 'vote', title: 'Private vote committed', description: 'A commit-reveal vote was committed' },
  revealed: { type: 'vote', title: 'Private vote revealed', description: 'A commit-reveal vote was revealed' },
}

function firstAddress(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const hit = data.find((v) => typeof v === 'string' && isStellarAddress(v))
  return typeof hit === 'string' ? formatStellarAddress(hit) : undefined
}

function toActivity(ev: BackendEvent): ActivityItem {
  const meta = ACTIVITY_META[ev.symbol] ?? {
    type: 'proposal' as const,
    title: ev.symbol,
    description: 'Contract event',
  }
  return {
    id: ev.id,
    type: meta.type,
    title: meta.title,
    description: meta.description,
    timestamp: new Date(ev.closed_at),
    user: firstAddress(ev.data),
  }
}

/** DAO-wide activity feed from the indexed contract event stream. */
export function useActivityFeed(limit: number = 50) {
  const { data } = useQuery({
    queryKey: ['activity', limit],
    queryFn: () => backend.getEvents(limit),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  })

  const activities = useMemo<ActivityItem[]>(() => (data ?? []).map(toActivity), [data])

  // Retained for API compatibility; the feed is server-driven and read-only.
  const addActivity = useCallback(() => {}, [])

  return { activities, addActivity }
}
