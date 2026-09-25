import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import { AppShell } from '@/components/AppShell'

const mockIsMember = vi.fn()
const mockIsAdmin = vi.fn()
const mockGetMember = vi.fn()
const mockGetPendingYield = vi.fn()
const mockGetNotifications = vi.fn()
const mockGetEvents = vi.fn()
let mockPathname = '/dashboard'
let mockWalletAddress: string | null = 'GALICE'
let mockIsConnected = true

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('@/lib/wallet', () => ({
  useWallet: () => ({
    address: mockWalletAddress,
    isConnected: mockIsConnected,
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signXDR: vi.fn(),
    networkMismatch: false,
    walletNetwork: mockIsConnected ? 'TESTNET' : null,
  }),
}))

vi.mock('@/lib/stellar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stellar')>('@/lib/stellar')
  return { ...actual, isContractConfigured: () => true }
})

vi.mock('@/lib/dao-client', () => ({
  daoRead: {
    isMember: (...a: unknown[]) => mockIsMember(...a),
    isAdmin: (...a: unknown[]) => mockIsAdmin(...a),
    getMember: (...a: unknown[]) => mockGetMember(...a),
    getPendingYield: (...a: unknown[]) => mockGetPendingYield(...a),
  },
  daoWrite: () => ({}),
}))

vi.mock('@/lib/backend', () => ({
  backend: {
    getLoans: vi.fn().mockResolvedValue([]),
    getNotifications: (...a: unknown[]) => mockGetNotifications(...a),
    getEvents: (...a: unknown[]) => mockGetEvents(...a),
    getStats: vi.fn().mockResolvedValue(null),
    getAdminLog: vi.fn().mockResolvedValue([]),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}))

describe('AppShell navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMember.mockResolvedValue(true)
    mockIsAdmin.mockResolvedValue(false)
    mockGetMember.mockResolvedValue(null)
    mockGetPendingYield.mockResolvedValue(BigInt(0))
    mockGetNotifications.mockResolvedValue([])
    mockGetEvents.mockResolvedValue([])
    mockPathname = '/dashboard'
    mockWalletAddress = 'GALICE'
    mockIsConnected = true
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the primary nav items and highlights the active route', async () => {
    renderWithProviders(<AppShell>content</AppShell>)

    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Loans/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Governance/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Treasury/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Privacy/ })).toBeInTheDocument()
  })

  it('does not show the Admin nav item for a non-admin member', async () => {
    mockIsAdmin.mockResolvedValue(false)
    renderWithProviders(<AppShell>content</AppShell>)

    await waitFor(() => expect(screen.getByRole('link', { name: /Loans/ })).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument()
  })

  it('shows the Admin nav item once isAdmin resolves true', async () => {
    mockIsAdmin.mockResolvedValue(true)
    renderWithProviders(<AppShell>content</AppShell>)

    await waitFor(() => expect(screen.getByRole('link', { name: /Admin/ })).toBeInTheDocument())
  })

  it('shows the connected wallet address, not the connect button, when a wallet is connected', () => {
    mockWalletAddress = 'GALICEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    mockIsConnected = true
    renderWithProviders(<AppShell>content</AppShell>)

    expect(screen.queryByRole('button', { name: /Connect Wallet/ })).not.toBeInTheDocument()
  })

  it('shows a Connect Wallet button when no wallet is connected', () => {
    mockWalletAddress = null
    mockIsConnected = false
    renderWithProviders(<AppShell>content</AppShell>)

    expect(screen.getByRole('button', { name: /Connect Wallet/ })).toBeInTheDocument()
  })

  it('does not show the "no contract configured" banner when a contract is configured', () => {
    renderWithProviders(<AppShell>content</AppShell>)
    expect(screen.queryByText(/No contract configured/)).not.toBeInTheDocument()
  })

  it('renders the network badge in the header when wallet is connected', () => {
    mockIsConnected = true
    renderWithProviders(<AppShell>content</AppShell>)
    expect(screen.getByText('Testnet')).toBeInTheDocument()
  })

  it('does not render the network badge when wallet is not connected', () => {
    mockWalletAddress = null
    mockIsConnected = false
    renderWithProviders(<AppShell>content</AppShell>)
    // Badge should not be rendered; only Connect button should appear
    expect(screen.queryByText(/Testnet|Mainnet|Futurenet/)).not.toBeInTheDocument()
  })
})
