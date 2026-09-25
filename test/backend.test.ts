import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backend, isBackendConfigured } from '@/lib/backend'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response
}

const CONFIGURED_URL = 'http://localhost:4000'

describe('backend fetch wrappers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', CONFIGURED_URL)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('getStats fetches /api/stats and returns the parsed body', async () => {
    const stats = { totalMembers: 5 }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(stats))
    const result = await backend.getStats()
    expect(fetch).toHaveBeenCalledWith(`${CONFIGURED_URL}/api/stats`, expect.objectContaining({ cache: 'no-store' }))
    expect(result).toEqual(stats)
  })

  it('getStats falls back to null when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false))
    expect(await backend.getStats()).toBeNull()
  })

  it('getStats falls back to null when fetch itself throws (backend unreachable)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    expect(await backend.getStats()).toBeNull()
  })

  it('getLoans without a borrower hits /api/loans with no query string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await backend.getLoans()
    expect(fetch).toHaveBeenCalledWith(`${CONFIGURED_URL}/api/loans`, expect.anything())
  })

  it('getLoans with a borrower URL-encodes it into the query string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await backend.getLoans('GA BC') // space to prove encoding happens
    expect(fetch).toHaveBeenCalledWith(
      `${CONFIGURED_URL}/api/loans?borrower=GA%20BC`,
      expect.anything()
    )
  })

  it('getLoans falls back to an empty array, not null, on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false))
    expect(await backend.getLoans()).toEqual([])
  })

  it('getEvents composes symbol + limit query params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await backend.getEvents(25, 'loan_req')
    expect(fetch).toHaveBeenCalledWith(
      `${CONFIGURED_URL}/api/events?symbol=loan_req&limit=25`,
      expect.anything()
    )
  })

  it('getAdminLog hits /api/admin/log with the limit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await backend.getAdminLog(10)
    expect(fetch).toHaveBeenCalledWith(`${CONFIGURED_URL}/api/admin/log?limit=10`, expect.anything())
  })

  it('markNotificationRead PATCHes the right URL and reports success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response)
    const ok = await backend.markNotificationRead(42)
    expect(fetch).toHaveBeenCalledWith(`${CONFIGURED_URL}/api/notifications/42/read`, { method: 'PATCH' })
    expect(ok).toBe(true)
  })

  it('markNotificationRead returns false on a non-ok response or a thrown error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    expect(await backend.markNotificationRead(1)).toBe(false)

    vi.mocked(fetch).mockRejectedValueOnce(new Error('down'))
    expect(await backend.markNotificationRead(1)).toBe(false)
  })

  it('markAllNotificationsRead URL-encodes the address', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response)
    await backend.markAllNotificationsRead('GA BC')
    expect(fetch).toHaveBeenCalledWith(
      `${CONFIGURED_URL}/api/notifications/read-all?address=GA%20BC`,
      { method: 'PATCH' }
    )
  })
})

describe('isBackendConfigured', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('returns false when NEXT_PUBLIC_BACKEND_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '')
    expect(isBackendConfigured()).toBe(false)
    // Also verify that BACKEND_URL export is empty when unset at import time?
    // The static export was evaluated with whatever env was at import, but the
    // function is dynamic, so we test the function.
  })

  it('returns true when NEXT_PUBLIC_BACKEND_URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', CONFIGURED_URL)
    expect(isBackendConfigured()).toBe(true)
  })

  it('does not make a network request when unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '')
    vi.stubGlobal('fetch', vi.fn())
    const result = await backend.getStats()
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('renders degraded empty state without network request when unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '')
    vi.stubGlobal('fetch', vi.fn())
    expect(await backend.getLoans()).toEqual([])
    expect(await backend.getEvents()).toEqual([])
    expect(await backend.getNotifications('GALICE')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
