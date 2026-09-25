'use client'

/**
 * Shared application shell: a sticky top bar plus a persistent sidebar on
 * desktop (a slide-over drawer on mobile). Renders the primary navigation from
 * a single source of truth, highlights the active route, and surfaces a banner
 * when no contract is configured. Rendered once by (app)/layout.tsx, so it
 * persists across navigation instead of remounting per page. A page's own
 * title/subtitle/actions header is <PageHeader>, rendered by the page itself.
 */
import { type ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Banknote,
  Users,
  Landmark,
  ShieldCheck,
  Settings,
  Menu,
  TriangleAlert,
} from 'lucide-react'
import { ConnectButton } from '@/components/ConnectButton'
import { NetworkBadge } from '@/components/NetworkBadge'
import NotificationCenter from '@/components/NotificationCenter'
import { OrbitMark } from '@/components/OrbitMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useUserData, useDAOStats } from '@/hooks/useDAO'
import { isContractConfigured } from '@/lib/stellar'
import { cn } from '@/lib/utils'

interface NavItem {
  name: string
  href: string
  icon: typeof Home
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Loans', href: '/loans', icon: Banknote },
  { name: 'Governance', href: '/governance', icon: Users },
  { name: 'Treasury', href: '/treasury', icon: Landmark },
  { name: 'Privacy', href: '/privacy', icon: ShieldCheck },
]

const ADMIN_ITEM: NavItem = { name: 'Admin', href: '/admin', icon: Settings }

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <OrbitMark className="h-9 w-9" />
      <span className="text-lg font-semibold tracking-tight text-foreground">
        OurDAO
      </span>
    </Link>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { isAdmin } = useUserData()
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5 shrink-0',
                active
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const stats = useDAOStats()

  return (
    // Wraps the whole shell (not just the drawer) so SheetTrigger — deep in
    // the header — and SheetContent — deep in the mobile-drawer section —
    // both sit under the same Radix Dialog.Root context despite being far
    // apart in the JSX. Using SheetTrigger (rather than a plain onClick)
    // is what lets Radix track and restore focus to this exact button when
    // the drawer closes (#68).
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <BrandMark />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NetworkBadge />
            <ThemeToggle />
            <NotificationCenter />
            <ConnectButton />
          </div>
        </div>
      </header>

      {!isContractConfigured() && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 sm:px-6">
          <TriangleAlert className="h-5 w-5 shrink-0" />
          <span>
            No contract configured — set{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900/40">
              NEXT_PUBLIC_CONTRACT_ID
            </code>{' '}
            to enable live data. The app is running in preview mode.
          </span>
        </div>
      )}

      {stats.indexerStale && (
        <div data-testid="indexer-stale-banner" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 sm:px-6">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Indexer data is stale{stats.secondsSinceUpdate != null ? ` (last updated ${stats.secondsSinceUpdate}s ago)` : ''}. Displayed off-chain stats and history may be delayed.
          </span>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-border bg-card py-4 lg:flex">
          <NavLinks />
        </aside>

        {/* Mobile drawer — built on the vendored Radix-based Sheet primitive
            instead of a hand-rolled div, so Escape-to-close, focus trapping
            + restoration to the hamburger button, role="dialog"/aria-modal,
            and body scroll lock all come from Radix rather than being
            reimplemented by hand (#68). */}
        <SheetContent
          side="left"
          className="w-64 gap-0 bg-card p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="flex h-full flex-col py-4">
            <div className="mb-2 px-4">
              <BrandMark />
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
    </Sheet>
  )
}
