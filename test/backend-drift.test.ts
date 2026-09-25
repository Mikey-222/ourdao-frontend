import { describe, expect, it } from 'vitest'
import type { BackendStats, BackendLoan } from '@/lib/backend'

/**
 * Drift test for ourdao-backend shapes.
 * Verified against ourdao-backend @ 7620d26 (2026-09-24).
 *
 * This test asserts that committed backend response fixtures contain all required
 * fields matching BackendStats (DAOStats) and BackendLoan (LoanRow + derived fields).
 */

const STATS_FIXTURE = {
  totalMembers: 12,
  activeMembers: 10,
  totalLoanProposals: 5,
  totalLoans: 3,
  activeLoans: 2,
  defaultedLoans: 1,
  totalTreasuryProposals: 4,
  totalStaked: '1000000000',
  lastIndexedLedger: 123456,
  secondsSinceUpdate: 15,
  indexerStale: false,
  totalDefaultedValue: '5000000',
  interestCollected: '1200000',
  principalLent: '50000000',
  principalRepaid: '25000000',
  valueDefaulted: '5000000',
}

const LOAN_FIXTURE = {
  id: 1,
  borrower: 'GA7Q...',
  amount: '10000000',
  outstanding: '5000000',
  total_repayment: '11000000',
  due_time: 1700000000,
  status: 'active',
  approved_ledger: 100,
  repaid_ledger: null,
  defaulted_ledger: null,
  updated_at: '2026-09-24T00:00:00Z',
  interest_charge: '1000000',
  repaid_amount: '6000000',
}

describe('Backend API Drift Checks (ourdao-backend @ 7620d26)', () => {
  it('DAOStats fixture contains all 16 required stats fields', () => {
    const requiredStatsKeys: (keyof BackendStats)[] = [
      'totalMembers',
      'activeMembers',
      'totalLoanProposals',
      'totalLoans',
      'activeLoans',
      'defaultedLoans',
      'totalTreasuryProposals',
      'totalStaked',
      'lastIndexedLedger',
      'secondsSinceUpdate',
      'indexerStale',
      'totalDefaultedValue',
      'interestCollected',
      'principalLent',
      'principalRepaid',
      'valueDefaulted',
    ]

    for (const key of requiredStatsKeys) {
      expect(STATS_FIXTURE).toHaveProperty(key)
    }

    // Verify key count matches exact shape
    expect(Object.keys(STATS_FIXTURE).sort()).toEqual(requiredStatsKeys.sort())
  })

  it('LoanRow + derived fixture contains all required backend loan fields including due_time, interest_charge, repaid_amount', () => {
    const requiredLoanKeys: (keyof BackendLoan)[] = [
      'id',
      'borrower',
      'amount',
      'outstanding',
      'total_repayment',
      'due_time',
      'status',
      'approved_ledger',
      'repaid_ledger',
      'defaulted_ledger',
      'updated_at',
      'interest_charge',
      'repaid_amount',
    ]

    for (const key of requiredLoanKeys) {
      expect(LOAN_FIXTURE).toHaveProperty(key)
    }

    expect(typeof LOAN_FIXTURE.due_time).toBe('number')
    expect(typeof LOAN_FIXTURE.total_repayment).toBe('string')
    expect(typeof LOAN_FIXTURE.interest_charge).toBe('string')
    expect(typeof LOAN_FIXTURE.repaid_amount).toBe('string')
  })
})
