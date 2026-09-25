import { describe, it, expect, vi } from 'vitest'
import { formatToken } from '../utils'
import { formatStellarAddress } from '../stellar'

// ---------------------------------------------------------------------------
// formatToken — integer string inputs (existing behaviour, must not regress)
// ---------------------------------------------------------------------------
describe('formatToken — integer string inputs', () => {
  it('formats a zero stroop amount', () => {
    expect(formatToken('0')).toBe('0')
    expect(formatToken(BigInt(0))).toBe('0')
  })

  it('formats a standard 7-decimal stroop amount', () => {
    // 10_000_000 stroops = 1.0 token
    expect(formatToken('10000000')).toBe('1')
  })

  it('formats an amount with a fractional part', () => {
    // 15_000_000 stroops = 1.5 token → displayed as 1.5
    expect(formatToken('15000000')).toBe('1.5')
  })

  it('returns a lower bound when value is non-zero but rounds to nothing', () => {
    // 1 stroop = 0.0000001, which rounds away at displayDecimals=4
    expect(formatToken('1')).toBe('<0.0001')
  })

  it('handles negative values', () => {
    expect(formatToken('-10000000')).toBe('-1')
    expect(formatToken(BigInt(-15000000))).toBe('-1.5')
  })

  it('handles negative values below display precision', () => {
    expect(formatToken('-1')).toBe('-<0.0001')
  })

  it('handles empty string as zero', () => {
    expect(formatToken('')).toBe('0')
  })

  it('accepts BigInt input directly', () => {
    expect(formatToken(BigInt('10000000'))).toBe('1')
    expect(formatToken(BigInt('25000000'))).toBe('2.5')
  })

  it('respects custom decimals', () => {
    // 2 decimals: 100 = 1.00
    expect(formatToken('100', { decimals: 2 })).toBe('1')
    expect(formatToken('150', { decimals: 2 })).toBe('1.5')
  })

  it('respects custom displayDecimals', () => {
    // 12345670 stroops at 7 decimals = 1.234567 → show only 2 → 1.23
    expect(formatToken('12345670', { displayDecimals: 2 })).toBe('1.23')
  })
})

// ---------------------------------------------------------------------------
// formatToken — fractional string rejection (Issue: silent truncation)
// ---------------------------------------------------------------------------
describe('formatToken — fractional inputs are rejected', () => {
  it('rejects a fractional string and returns em-dash', () => {
    // Suppress the console.error we expect
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = formatToken('1.5')
    expect(result).toBe('—')
    expect(spy).toHaveBeenCalledWith(
      'formatToken failed:',
      expect.any(Error),
      expect.objectContaining({ value: '1.5' })
    )
    spy.mockRestore()
  })

  it('rejects a fractional number-like string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('0.5')).toBe('—')
    spy.mockRestore()
  })

  it('rejects a negative fractional string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('-1.5')).toBe('—')
    spy.mockRestore()
  })

  it('rejects exponent notation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('1e7')).toBe('—')
    expect(formatToken('1E7')).toBe('—')
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// formatToken — catch block returns visible error (Issue: '0' on failure)
// ---------------------------------------------------------------------------
describe('formatToken — failure path is distinct from genuine zero', () => {
  it('genuine zero returns "0", not the error marker', () => {
    expect(formatToken('0')).toBe('0')
    expect(formatToken(BigInt(0))).toBe('0')
  })

  it('failure returns "—" (em-dash), not "0"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A string BigInt cannot parse
    expect(formatToken('not_a_number')).toBe('—')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('failure is logged to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    formatToken('garbage')
    expect(spy).toHaveBeenCalledWith(
      'formatToken failed:',
      expect.any(Error),
      expect.objectContaining({ value: 'garbage' })
    )
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// formatStellarAddress — output format pinning (Issue: duplicate formatters)
// ---------------------------------------------------------------------------
describe('formatStellarAddress — canonical output', () => {
  const FULL_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV'

  it('truncates with proper ellipsis character (…) and 4/4 default', () => {
    const result = formatStellarAddress(FULL_ADDRESS)
    expect(result).toBe('GABC…STUV')
    // Must use the proper ellipsis, NOT three dots
    expect(result).toContain('…')
    expect(result).not.toContain('...')
  })

  it('returns empty string for undefined/null input', () => {
    expect(formatStellarAddress(undefined)).toBe('')
    expect(formatStellarAddress('')).toBe('')
  })

  it('returns the full address when it is short enough', () => {
    expect(formatStellarAddress('GABC')).toBe('GABC')
    // 4+4+1 = 9 chars — just at the boundary
    expect(formatStellarAddress('GABCDEFGH')).toBe('GABCDEFGH')
  })

  it('supports custom truncation length', () => {
    const result = formatStellarAddress(FULL_ADDRESS, 6)
    expect(result).toBe('GABCDE…QRSTUV')
  })
})
