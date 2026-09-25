'use client'

// Barrel re-export so every existing `from '@/hooks/useDAO'` import keeps
// working unchanged. The actual implementation is split by responsibility:
//   - src/lib/dao-mappers.ts   — pure ScVal/DTO -> UI-type mapping, no React
//   - src/hooks/dao/enumeration.ts — paginated, concurrency-bounded proposal
//     enumeration (the contract has no queryable proposal list)
//   - src/hooks/dao/reads.ts   — core contract/user/stats/event reads
//   - src/hooks/dao/proposal-reads.ts — proposal, loan, staking, document and
//     admin reads
//   - src/hooks/dao/writes.ts  — write actions (shared useWriteAction plumbing
//     plus every mutation hook)
// Former duplicate src/hooks/useDAO.tsx (issue #115) has been removed — this
// barrel is the single canonical entry point. Its former exclusive fixes
// (explorer-link toast, refetchIntervalInBackground: false) are now ported
// into the split modules above.
export * from '@/lib/dao-mappers'
export * from './dao/enumeration'
export * from './dao/reads'
export * from './dao/proposal-reads'
export * from './dao/writes'
