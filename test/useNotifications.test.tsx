import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAutoNotifications, useActivityFeed } from '@/hooks/useNotifications'
import type { BackendEvent, BackendNotification } from '@/lib/backend'

const mockGetNotifications = vi.fn()
const mockMarkNotificationRead = vi.fn()
const mockMarkAllNotificationsRead = vi.fn()
const mockGetEvents = vi.fn()

vi.mock('@/lib/wallet', () => ({
  useWallet: () => ({ address: 'GALICE', isConnected: true }),
}))

vi.mock('@/lib/backend', () => ({
  backend: {
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
    markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
    getEvents: (...args: unknown[]) => mockGetEvents(...args),
  },
}))

function Harness({ onRender }: { onRender: (hook: ReturnType<typeof useAutoNotifications>) => void }) {
  const hook = useAutoNotifications()
  onRender(hook)
  return null
}

function renderWithClient(onRender: (hook: ReturnType<typeof useAutoNotifications>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness onRender={onRender} />
    </QueryClientProvider>
  )
}

const notif = (over: Partial<BackendNotification> = {}): BackendNotification => ({
  id: 1,
  address: 'GALICE',
  type: 'info',
  title: 'Hi',
  message: 'msg',
  ledger: 1,
  tx_hash: null,
  read: false,
  created_at: new Date().toISOString(),
  ...over,
})

describe('useAutoNotifications', () => {
  beforeEach(() => {
    mockGetNotifications.mockReset().mockResolvedValue([])
    mockMarkNotificationRead.mockReset().mockResolvedValue(true)
    mockMarkAllNotificationsRead.mockReset().mockResolvedValue(true)
  })
  afterEach(() => vi.clearAllMocks())

  it('maps backend notifications and computes unreadCount', async () => {
    mockGetNotifications.mockResolvedValue([notif({ id: 1, read: false }), notif({ id: 2, read: true })])
    let latest: ReturnType<typeof useAutoNotifications> | undefined
    renderWithClient((hook) => { latest = hook })

    await waitFor(() => expect(latest?.notifications).toHaveLength(2))
    expect(latest?.unreadCount).toBe(1)
  })

  it('markAsRead optimistically flips read locally and persists via the backend', async () => {
    mockGetNotifications.mockResolvedValue([notif({ id: 5, read: false })])
    let latest: ReturnType<typeof useAutoNotifications> | undefined
    renderWithClient((hook) => { latest = hook })
    await waitFor(() => expect(latest?.notifications).toHaveLength(1))

    await act(async () => {
      latest!.markAsRead('5')
    })

    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith(5))
  })

  it('markAllAsRead calls the backend with the connected address', async () => {
    mockGetNotifications.mockResolvedValue([notif({ id: 1 }), notif({ id: 2 })])
    let latest: ReturnType<typeof useAutoNotifications> | undefined
    renderWithClient((hook) => { latest = hook })
    await waitFor(() => expect(latest?.notifications).toHaveLength(2))

    await act(async () => {
      latest!.markAllAsRead()
    })

    await waitFor(() => expect(mockMarkAllNotificationsRead).toHaveBeenCalledWith('GALICE'))
  })

  it('removeNotification filters the notification out client-side', async () => {
    mockGetNotifications.mockResolvedValue([notif({ id: 1 }), notif({ id: 2 })])
    let latest: ReturnType<typeof useAutoNotifications> | undefined
    renderWithClient((hook) => { latest = hook })
    await waitFor(() => expect(latest?.notifications).toHaveLength(2))

    act(() => {
      latest!.removeNotification('1')
    })

    await waitFor(() => expect(latest?.notifications.map((n) => n.id)).toEqual(['2']))
  })
})

function ActivityHarness({ onRender }: { onRender: (r: ReturnType<typeof useActivityFeed>) => void }) {
  const result = useActivityFeed(10)
  onRender(result)
  return null
}

const event = (over: Partial<BackendEvent> = {}): BackendEvent => ({
  id: '1-0',
  ledger: 1,
  closed_at: new Date().toISOString(),
  contract_id: 'C1',
  symbol: 'joined',
  topics: [],
  data: [],
  tx_hash: null,
  created_at: new Date().toISOString(),
  ...over,
})

describe('useActivityFeed', () => {
  beforeEach(() => {
    mockGetEvents.mockReset()
  })

  it('maps a known symbol to its activity metadata', async () => {
    mockGetEvents.mockResolvedValue([event({ symbol: 'loan_appr' })])
    let latest: ReturnType<typeof useActivityFeed> | undefined
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ActivityHarness onRender={(r) => { latest = r }} />
      </QueryClientProvider>
    )

    await waitFor(() => expect(latest?.activities).toHaveLength(1))
    expect(latest?.activities[0]).toMatchObject({ type: 'loan', title: 'Loan approved' })
  })

  it.each([
    ['loan_rej', 'loan', 'Loan rejected'],
    ['loan_wait', 'loan', 'Loan awaiting funds'],
    ['tre_rej', 'treasury', 'Treasury proposal rejected'],
    ['tre_wait', 'treasury', 'Treasury withdrawal awaiting funds'],
  ])('surfaces the failure event %s as a distinct activity', async (symbol, type, title) => {
    mockGetEvents.mockResolvedValue([event({ symbol })])
    let latest: ReturnType<typeof useActivityFeed> | undefined
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ActivityHarness onRender={(r) => { latest = r }} />
      </QueryClientProvider>
    )

    await waitFor(() => expect(latest?.activities).toHaveLength(1))
    expect(latest?.activities[0]).toMatchObject({ type, title })
  })

  it('falls back to the raw symbol for an unrecognized event', async () => {
    mockGetEvents.mockResolvedValue([event({ symbol: 'some_future_event' })])
    let latest: ReturnType<typeof useActivityFeed> | undefined
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ActivityHarness onRender={(r) => { latest = r }} />
      </QueryClientProvider>
    )

    await waitFor(() => expect(latest?.activities).toHaveLength(1))
    expect(latest?.activities[0]).toMatchObject({ type: 'proposal', title: 'some_future_event' })
  })
})
