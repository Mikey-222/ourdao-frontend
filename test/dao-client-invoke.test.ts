// @vitest-environment node
//
// jsdom's crypto polyfill isn't compatible with @noble/ed25519's random-byte
// generation (used by Keypair.random()), so this pure-logic suite (no DOM
// interaction) opts back into the real Node environment — same reasoning as
// dao-client-sc.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, StrKey } from '@stellar/stellar-sdk'

const mockGetAccount = vi.fn()
const mockPrepareTransaction = vi.fn()
const mockSendTransaction = vi.fn()
const mockGetTransaction = vi.fn()

// A structurally valid (checksummed) contract strkey — `new Contract(...)`
// validates the checksum, so an arbitrary "CAAA...AAA" string is rejected.
// Named with the `mock` prefix so vitest's vi.mock hoisting allows the
// factory below to reference it.
const mockContractId = StrKey.encodeContract(Buffer.alloc(32))

vi.mock('@/lib/stellar', () => ({
  CONTRACT_ID: mockContractId,
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  isContractConfigured: () => true,
  server: {
    getAccount: (...a: unknown[]) => mockGetAccount(...a),
    prepareTransaction: (...a: unknown[]) => mockPrepareTransaction(...a),
    sendTransaction: (...a: unknown[]) => mockSendTransaction(...a),
    getTransaction: (...a: unknown[]) => mockGetTransaction(...a),
  },
}))

// Imported after the mock so `invoke` picks up the mocked `server`.
const { invoke, InvokeError } = await import('@/lib/dao-client')

const WALLET = Keypair.random().publicKey()
// A no-op "signer" — invoke() never inspects the signature itself, only
// that the returned XDR parses back into a Transaction.
const signXDR = async (xdr: string) => xdr

describe('invoke()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    mockGetAccount.mockResolvedValue(new Account(WALLET, '0'))
    // Real prepareTransaction assembles auth/footprint; the unit under test
    // doesn't depend on that, so pass the built transaction through as-is.
    mockPrepareTransaction.mockImplementation(async (tx) => tx)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('PENDING: polls and resolves once the transaction succeeds', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-pending' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    const result = await invoke(WALLET, signXDR, 'register_member')

    expect(result.hash).toBe('hash-pending')
    expect(mockGetTransaction).toHaveBeenCalledWith('hash-pending')
  })

  it('DUPLICATE: polls the already-in-flight hash instead of treating it as an error', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'DUPLICATE', hash: 'hash-dup' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    const result = await invoke(WALLET, signXDR, 'register_member')

    expect(result.hash).toBe('hash-dup')
  })

  it('ERROR: throws immediately (no polling) with retryable: false', async () => {
    mockSendTransaction.mockResolvedValue({
      status: 'ERROR',
      hash: 'hash-error',
      errorResult: { code: 'txFAILED' },
    })

    await expect(invoke(WALLET, signXDR, 'register_member')).rejects.toMatchObject({
      retryable: false,
    })
    expect(mockGetTransaction).not.toHaveBeenCalled()
  })

  it('TRY_AGAIN_LATER: throws its own message immediately, not the NOT_FOUND poll message', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'TRY_AGAIN_LATER', hash: 'hash-busy' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    await expect(promise).rejects.toBeInstanceOf(InvokeError)
    await expect(promise).rejects.toMatchObject({ retryable: true })
    await expect(promise).rejects.toThrow(/network is busy/i)

    // The whole point: it never touches getTransaction, so it can't have
    // spent the 30s poll budget getting here.
    expect(mockGetTransaction).not.toHaveBeenCalled()
  })

  it('NOT_FOUND past the timebound: throws a distinct "expired" error, not "did not succeed (NOT_FOUND)"', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-lost' })
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    // Let the poll loop run to completion — the transaction's own ~30s
    // time bound, not a hardcoded 30 iterations.
    const settled = promise.catch((e) => e)
    await vi.advanceTimersByTimeAsync(31_000)
    const error = await settled

    expect(error).toBeInstanceOf(InvokeError)
    expect(error.retryable).toBe(true)
    expect(error.message).toMatch(/submission window expired/i)
    expect(error.message).not.toMatch(/did not succeed/i)
  })

  it('FAILED: throws a terminal error distinct from the NOT_FOUND-timeout case', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-failed' })
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    const settled = promise.catch((e) => e)
    const error = await settled

    expect(error).toBeInstanceOf(InvokeError)
    expect(error.retryable).toBe(false)
    expect(error.message).toContain('failed on-chain')
  })

  it('resolves quickly once getTransaction stops returning NOT_FOUND, without waiting out the full deadline', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-eventually' })
    let calls = 0
    mockGetTransaction.mockImplementation(async () => {
      calls += 1
      if (calls < 3) return { status: 'NOT_FOUND' }
      return { status: 'SUCCESS', returnValue: undefined }
    })

    const promise = invoke(WALLET, signXDR, 'register_member')
    await vi.advanceTimersByTimeAsync(3_000)
    const result = await promise

    expect(result.hash).toBe('hash-eventually')
    expect(calls).toBe(3)
  })

  it('builds the transaction with an inclusion fee multiplier to survive network congestion', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-fee-test' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    // Capture the fee on the transaction passed to prepareTransaction
    let capturedFee: string | undefined
    mockPrepareTransaction.mockImplementation(async (tx) => {
      capturedFee = tx.fee
      return tx
    })

    await invoke(WALLET, signXDR, 'register_member')

    // BASE_FEE is 100 stroops; multiplier is 1.5, so fee should be 150.
    // Transaction.fee is a string of stroops.
    expect(capturedFee).toBe('150')
  })
})
