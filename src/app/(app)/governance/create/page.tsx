'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  DocumentPlusIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useUserData, useProposeTreasury } from '@/hooks/useDAO'
import { parseToken } from '@/lib/utils'
import { isStellarAddress } from '@/lib/stellar'
import toast from 'react-hot-toast'

export default function CreateProposalPage() {
  const router = useRouter()
  const userData = useUserData()
  const { propose, isPending } = useProposeTreasury()

  const [form, setForm] = useState({
    amount: '',
    destination: '',
    reason: '',
    isPrivate: false,
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (!userData.isConnected || !userData.isMember) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <ExclamationTriangleIcon className="mx-auto mb-4 h-12 w-12 text-amber-500 dark:text-amber-400" />
            <h3 className="mb-2 text-lg font-medium text-foreground">
              Member Only
            </h3>
            <p className="text-muted-foreground">
              Only DAO members can create governance proposals.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Private voting is disabled until commit/reveal UI exists — a private
    // proposal is currently unvotable by anyone (see /privacy). Guard even if
    // the checkbox is bypassed via devtools.
    if (form.isPrivate) {
      toast.error('Private voting is disabled until commit/reveal voting is implemented. See /privacy.')
      return
    }

    const amount = parseToken(form.amount)
    if (amount <= BigInt(0)) {
      toast.error('Enter a valid amount greater than zero')
      return
    }
    if (!isStellarAddress(form.destination.trim())) {
      toast.error('Enter a valid Stellar destination address (G… or C…)')
      return
    }
    if (!form.reason.trim()) {
      toast.error('A reason is required')
      return
    }

    try {
      await propose(amount, form.destination.trim(), form.reason.trim(), false)
      router.push('/governance')
    } catch {
      /* toast handled in hook */
    }
  }

  return (
    <>
      <PageHeader
        title="Create Proposal"
        subtitle="Propose a treasury withdrawal for members to vote on"
      />
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DocumentPlusIcon className="h-5 w-5 text-primary-600" />
              Treasury Withdrawal
            </CardTitle>
            <CardDescription>
              If approved by member consensus, the requested amount is sent from
              the treasury to the destination address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="proposal-amount" className="mb-1 block text-sm font-medium text-foreground">
                  Amount
                </label>
                <input
                  id="proposal-amount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-input px-3 py-2.5 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label htmlFor="proposal-destination" className="mb-1 block text-sm font-medium text-foreground">
                  Destination address
                </label>
                <input
                  id="proposal-destination"
                  type="text"
                  value={form.destination}
                  onChange={(e) => set('destination', e.target.value)}
                  placeholder="G… or C…"
                  spellCheck={false}
                  className="w-full rounded-lg border border-input px-3 py-2.5 font-mono text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label htmlFor="proposal-reason" className="mb-1 block text-sm font-medium text-foreground">
                  Reason
                </label>
                <textarea
                  id="proposal-reason"
                  rows={4}
                  value={form.reason}
                  onChange={(e) => set('reason', e.target.value)}
                  placeholder="Explain what this withdrawal is for…"
                  className="w-full rounded-lg border border-input px-3 py-2.5 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 opacity-75">
                <input
                  id="proposal-private"
                  type="checkbox"
                  checked={false}
                  disabled
                  aria-disabled="true"
                  onChange={() => {}}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <label htmlFor="proposal-private" className="flex flex-col gap-0.5 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <EyeSlashIcon className="h-4 w-4" />
                    Private voting (commit-reveal) — disabled
                  </span>
                  <span className="text-muted-foreground">
                    Commit/reveal voting is designed but not yet usable: the contract does not
                    enforce a commit window and this app has no commit/reveal UI, so a private
                    proposal is currently unvotable by anyone. Disabled until those land — see{' '}
                    <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                      /privacy
                    </Link>{' '}
                    for details and tracking links.
                  </span>
                </label>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
                <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  Treasury withdrawals require a higher consensus (60%) than loan
                  proposals.
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/governance')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Submitting…' : 'Create Proposal'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
