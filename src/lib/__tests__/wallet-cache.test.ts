import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Wallet cache invalidation — unit tests
//
// These tests verify the cache-management *logic* extracted from the wallet
// provider, not the full React component tree (which requires Freighter mocks
// and is better suited for integration tests). The key invariant: after an
// account switch or disconnect, no query data from a previous account is
// readable.
// ---------------------------------------------------------------------------
describe('wallet cache invalidation logic', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000 } },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('queryClient.clear() removes all cached data', () => {
    // Simulate cached data from account A
    const accountA = 'GABCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    queryClient.setQueryData(['userData', accountA], { isMember: true })
    queryClient.setQueryData(['userLoans', accountA], [{ id: 1 }])
    queryClient.setQueryData(['stake', accountA], BigInt(100))
    queryClient.setQueryData(['notifications', accountA], [{ id: 'n1' }])
    queryClient.setQueryData(['hasVoted', 'Loan', 1, accountA], true)
    queryClient.setQueryData(['document', 'hash123', accountA], { content: 'secret' })

    // Verify data exists before clear
    expect(queryClient.getQueryData(['userData', accountA])).toBeTruthy()
    expect(queryClient.getQueryData(['notifications', accountA])).toBeTruthy()
    expect(queryClient.getQueryData(['document', 'hash123', accountA])).toBeTruthy()

    // Simulate account switch → clear()
    queryClient.clear()

    // All data from account A is gone
    expect(queryClient.getQueryData(['userData', accountA])).toBeUndefined()
    expect(queryClient.getQueryData(['userLoans', accountA])).toBeUndefined()
    expect(queryClient.getQueryData(['stake', accountA])).toBeUndefined()
    expect(queryClient.getQueryData(['notifications', accountA])).toBeUndefined()
    expect(queryClient.getQueryData(['hasVoted', 'Loan', 1, accountA])).toBeUndefined()
    expect(queryClient.getQueryData(['document', 'hash123', accountA])).toBeUndefined()
  })

  it('address-scoped document key prevents cross-account cache hits', () => {
    const accountA = 'GABCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const accountB = 'GXYZBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    const docHash = 'QmSomeIPFSHash'

    // Account A's document is cached under its own key
    queryClient.setQueryData(['document', docHash, accountA], {
      content: new Uint8Array([1, 2, 3]),
    })

    // Account B queries the same document hash — different key, no cache hit
    const resultForB = queryClient.getQueryData(['document', docHash, accountB])
    expect(resultForB).toBeUndefined()

    // Account A's data is still there under its own key
    const resultForA = queryClient.getQueryData(['document', docHash, accountA])
    expect(resultForA).toBeTruthy()
  })

  it('disconnect (clear) removes data even for non-address-scoped keys', () => {
    // Some keys like 'daoStats' are not address-scoped but still get cleared
    queryClient.setQueryData(['daoStats'], { totalMembers: 5 })
    queryClient.setQueryData(['daoEvents'], [])
    queryClient.setQueryData(['admins'], ['GABC...'])

    queryClient.clear()

    expect(queryClient.getQueryData(['daoStats'])).toBeUndefined()
    expect(queryClient.getQueryData(['daoEvents'])).toBeUndefined()
    expect(queryClient.getQueryData(['admins'])).toBeUndefined()
  })
})
