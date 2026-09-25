'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // next-themes only knows the resolved (system-aware) theme on the client,
  // after hydration — rendering a theme-dependent icon before that would
  // mismatch the server-rendered HTML. A same-size placeholder avoids
  // layout shift once the real icon appears.
  if (resolvedTheme === undefined) {
    return <div className="h-9 w-9 rounded-lg p-2" aria-hidden />
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}
