'use client'

/**
 * Client for the OurDAO backend (ourdao-backend) — the off-chain indexer +
 * read API. The Soroban contract stays the source of truth for writes and
 * live member/treasury reads; the backend supplies history and aggregates the
 * chain can't cheaply serve (loan history, notifications, the event feed).
 *
 * Every call fails soft: if the backend is unreachable or not configured, the
 * helpers resolve to empty/null so the UI degrades to its on-chain-only state
 * rather than throwing.
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export const isBackendConfigured = (): boolean => !!process.env.NEXT_PUBLIC_BACKEND_URL

// --- Response shapes (mirror ourdao-backend/src/types.ts as of commit 7620d26; amounts are strings) ---

export interface BackendStats {
  totalMembers: number
  activeMembers: number
  totalLoanProposals: number
  totalLoans: number
  activeLoans: number
  defaultedLoans: number
  totalTreasuryProposals: number
  totalStaked: string
  lastIndexedLedger: number | null
  secondsSinceUpdate: number | null
  indexerStale: boolean
  totalDefaultedValue: string
  interestCollected: string
  principalLent: string
  principalRepaid: string
  valueDefaulted: string
}

// Verified against LoanRow and /api/loans withLoanDerived route in ourdao-backend @ 7620d26
export interface BackendLoan {
  id: number
  borrower: string
  amount: string
  outstanding: string
  total_repayment: string
  due_time: number | null
  status: 'active' | 'repaid' | 'defaulted'
  approved_ledger: number | null
  repaid_ledger: number | null
  defaulted_ledger: number | null
  updated_at: string
  interest_charge?: string | null
  repaid_amount?: string | null
}

export interface BackendNotification {
  id: number
  address: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  ledger: number | null
  tx_hash: string | null
  read: boolean
  created_at: string
}

export interface BackendEvent {
  id: string
  ledger: number
  closed_at: string
  contract_id: string
  symbol: string
  topics: unknown
  data: unknown
  tx_hash: string | null
  created_at: string
}

// --- Fetch helper -----------------------------------------------------------

// TODO #144: Backend fetches currently have no timeout or abort signal. A hung
// indexer (or dropped route/stalled proxy) leaves each fetch pending indefinitely.
// With polling on ~15s intervals, stalled requests accumulate and the UI never
// degrades to the on-chain-only state promised in the module docstring.
//
// IMPROVEMENT STRATEGY:
// 1. Add a named timeout constant shorter than the poll interval (e.g., 5-8s)
//    const BACKEND_REQUEST_TIMEOUT_MS = 5000; // Must be < poll interval
//
// 2. Create a shared request helper that wraps all fetches:
//    async function fetchWithTimeout<T>(path: string, options: RequestInit): Promise<Response> {
//      const signal = AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS);
//      return fetch(`${BACKEND_URL}${path}`, { ...options, signal });
//    }
//
// 3. Route every fetch through it (both get() and patch())
// 4. Map AbortError to the same empty/null fallback already used for network errors
//    } catch (error) {
//      if (error instanceof Error && error.name === 'AbortError') {
//        // Timeout hit — degrade gracefully like other failures
//      }
//      return fallback;
//    }
//
// 5. Add a test case covering the "never settles" timeout path (currently only
//    "rejects" is tested). Use fake-timers or jsdom AbortSignal.timeout polyfill
//    if needed (check test/degradation-modes.test.tsx setup).

async function get<T>(path: string, fallback: T): Promise<T> {
  if (!isBackendConfigured()) return fallback
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { accept: 'application/json' },
      // Indexed data changes often; never serve a stale cache.
      cache: 'no-store',
    })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    // Backend down / CORS / network — degrade gracefully.
    return fallback
  }
}

/** PATCH with no body. Returns whether the backend accepted the mutation. */
async function patch(path: string): Promise<boolean> {
  if (!isBackendConfigured()) return false
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  try {
    const res = await fetch(`${base}${path}`, { method: 'PATCH' })
    return res.ok
  } catch {
    return false
  }
}

// --- Endpoints --------------------------------------------------------------

export const backend = {
  getStats: () => get<BackendStats | null>('/api/stats', null),

  getLoans: (borrower?: string) =>
    get<BackendLoan[]>(
      borrower ? `/api/loans?borrower=${encodeURIComponent(borrower)}` : '/api/loans',
      []
    ),

  getLoan: (id: number) => get<BackendLoan | null>(`/api/loans/${id}`, null),

  getNotifications: (address: string, limit = 50) =>
    get<BackendNotification[]>(
      `/api/notifications?address=${encodeURIComponent(address)}&limit=${limit}`,
      []
    ),

  getEvents: (limit = 50, symbol?: string) =>
    get<BackendEvent[]>(
      symbol
        ? `/api/events?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
        : `/api/events?limit=${limit}`,
      []
    ),

  getAdminLog: (limit = 50) => get<BackendEvent[]>(`/api/admin/log?limit=${limit}`, []),

  markNotificationRead: (id: number) => patch(`/api/notifications/${id}/read`),

  markAllNotificationsRead: (address: string) =>
    patch(`/api/notifications/read-all?address=${encodeURIComponent(address)}`),
}
