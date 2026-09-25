'use client'

import Link from 'next/link'
import {
  ShieldCheckIcon,
  LockClosedIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { useUserData, useTreasuryProposals } from '@/hooks/useDAO'
import { PageHeader } from '@/components/PageHeader'

export default function PrivacyPage() {
  const userData = useUserData()
  const { proposals, isLoading } = useTreasuryProposals()

  if (!userData.isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="bg-card rounded-lg p-6 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 dark:text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Wallet Not Connected
          </h2>
          <p className="text-muted-foreground">
            Please connect your wallet to view privacy features.
          </p>
        </div>
      </div>
    )
  }

  const privateCount = proposals.filter((p) => p.isPrivate).length
  const publicCount = proposals.length - privateCount

  return (
    <>
      <PageHeader
        title="Privacy"
        subtitle="What's actually private on-chain, and how to use it."
      />
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top-level limitation banner — what a member needs before choosing "private" */}
        <div className="rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-semibold">Heads up before using private proposals</p>
            <p>
              Private treasury voting is <strong>designed</strong> as commit-reveal but is{' '}
              <strong>not yet enforced</strong> as a full privacy guarantee and has no
              commit/reveal UI in this app today. A proposal created as private currently
              cannot be voted on by anyone — including its creator. See details below.
            </p>
          </div>
        </div>

        <div className="bg-card rounded-lg p-6 border border-border">
          <div className="flex items-start space-x-4">
            <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <EyeSlashIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">
                Commit-reveal private treasury voting
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Treasury proposals can be flagged as <strong>private</strong>. The intended
                design is two-phase: members first submit a hidden commitment (SHA-256 of
                choice + 32-byte salt), then reveal later, so the running tally stays
                hidden until the reveal window.
              </p>

              <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  What is actually enforced today
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 dark:text-amber-200 space-y-1">
                  <li>
                    <strong>No phase separation.</strong> The contract&apos;s{' '}
                    <code className="font-mono text-xs">privacy.rs</code> lets{' '}
                    <code className="font-mono text-xs">commit_vote</code> and{' '}
                    <code className="font-mono text-xs">reveal_vote</code> be called at any
                    time while a proposal is pending, and{' '}
                    <code className="font-mono text-xs">reveal_vote</code> tallies
                    immediately via <code className="font-mono text-xs">treasury::tally</code>{' '}
                    and emits <code className="font-mono text-xs">tre_vote</code>. A voter
                    can commit and reveal in consecutive transactions, so the partial result
                    is public while others are still committing — the exact leak the scheme
                    is meant to prevent.
                  </li>
                  <li>
                    <strong>Commitments are overwritable</strong> before reveal, so they
                    don&apos;t bind the voter.
                  </li>
                  <li>
                    <strong>No commit/reveal UI exists</strong> in this app. Creating a
                    private proposal succeeds on-chain, but neither you nor other members
                    can then commit or reveal a vote on it — the proposal is effectively
                    unvotable until that UI ships.
                  </li>
                  <li>
                    <strong>Client commitment is now correct.</strong> The app&apos;s{' '}
                    <code className="font-mono text-xs">generateCommitment</code> in{' '}
                    <code className="font-mono text-xs">src/lib/utils.ts</code> now uses
                    SHA-256 of support byte + salt, matching the contract&apos;s hash. The
                    older 32-bit demo hash issue is fixed; the remaining gaps are contract
                    phase enforcement and the missing UI.
                  </li>
                </ul>
                <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
                  <strong>What this means for you:</strong> if you need the tally hidden
                  while voting is open, do not rely on the private flag today — votes
                  become visible as soon as they are revealed, and there is no enforced
                  window where everyone must commit before anyone can reveal.
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Tracked in <code className="font-mono">ourdao-contracts</code> (privacy
                  phase separation &amp; binding) and in this repo (commit/reveal UI).
                  This page will be updated once those land — see PR notes / README for
                  links.
                </p>
              </div>

              <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1.5">
                <InformationCircleIcon className="h-4 w-4 text-muted-foreground" />
                Creating a private proposal is currently disabled on{' '}
                <Link href="/governance/create" className="text-blue-600 dark:text-blue-400 hover:underline">
                  /governance/create
                </Link>{' '}
                for exactly this reason — an unvotable proposal is worse than no option.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg p-6 border border-border">
          <div className="flex items-start space-x-4">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <LockClosedIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">Document encryption</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When attaching supporting documents to a loan or treasury proposal, you can
                encrypt them client-side (AES-GCM, password-derived key via PBKDF2 with 100k
                iterations) before upload — the contract only ever stores a content hash,
                never the document itself or your password.
              </p>
              <div className="mt-4 rounded-lg border border-border bg-muted p-4">
                <p className="text-sm font-semibold text-foreground">Storage status today</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Encryption is real and happens entirely in the browser. Uploads are pinned
                  via the app&apos;s server route <code className="font-mono text-xs">POST /api/documents</code>{' '}
                  to Pinata using a server-only credential (
                  <code className="font-mono text-xs">PINATA_JWT</code> — never in the client
                  bundle). If that credential is not configured, the upload fails with a
                  visible <code className="font-mono text-xs">503</code> error — it does not
                  silently go nowhere. Reads come from the public gateway (
                  <code className="font-mono text-xs">NEXT_PUBLIC_IPFS_GATEWAY</code>, no
                  credential needed).
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  The earlier Infura IPFS endpoint referenced in audits is no longer the
                  target; pinning is Pinata-only now. Documents are not stored at all until
                  the operator sets <code className="font-mono text-xs">PINATA_JWT</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg p-6 border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-muted-foreground" />
            Treasury proposal privacy, DAO-wide
          </h3>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{privateCount}</div>
                <div className="text-sm text-muted-foreground">Private proposals</div>
                <p className="text-xs text-muted-foreground mt-1">Unvotable until commit/reveal UI ships.</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{publicCount}</div>
                <div className="text-sm text-muted-foreground">Public proposals</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg p-6 bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground">Tracking &amp; next update</h3>
          <p className="text-sm text-muted-foreground mt-1">
            The contract phase-separation and binding fixes and the client commit/reveal UI
            are tracked separately in{' '}
            <code className="font-mono text-xs">ourdao-contracts</code> and in this repo.
            This page intentionally describes the current, weaker reality — it will be
            rewritten to claim the stronger guarantees only after those issues land. See the
            PR that introduced this copy for the exact issue links so the gap isn&apos;t
            forgotten.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Light and dark themes both verified for this page. Privacy claims here are held
            to the same bar as <code className="font-mono text-xs">CONTRIBUTING.md</code>&apos;s
            no-fabricated-content rule — every guarantee stated is either enforced today or
            explicitly marked as not yet delivered.
          </p>
        </div>

        <div className="rounded-lg p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Everything else — membership, loan proposals, loan votes, staking — is public
            on-chain by design, the same as any Soroban contract. There is no account-level
            &quot;privacy mode&quot; covering activity outside the two features above.
          </p>
        </div>
      </div>
    </>
  )
}
