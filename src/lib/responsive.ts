import { useSyncExternalStore } from 'react'

// Breakpoint definitions (following Tailwind CSS conventions) — module-private;
// the surviving hooks need them but nothing outside the file does.
const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

type Breakpoint = keyof typeof breakpoints

// --- Shared matchMedia store for useScreenSize ---
// A single set of matchMedia listeners shared by all consumers, so three
// components using the hook still only produce one set of browser listeners.

type ScreenState = { breakpoint: Breakpoint; width: number }

const mediaQueries: { bp: Breakpoint; mql: MediaQueryList }[] = []
let cachedState: ScreenState = { breakpoint: 'lg', width: 1024 }
let listenerCount = 0

function getInitialBreakpoint(): ScreenState {
  if (typeof window === 'undefined') return { breakpoint: 'lg', width: 1024 }
  const w = window.innerWidth
  return { breakpoint: widthToBreakpoint(w), width: w }
}

function widthToBreakpoint(w: number): Breakpoint {
  if (w < breakpoints.sm) return 'sm'
  if (w < breakpoints.md) return 'md'
  if (w < breakpoints.lg) return 'lg'
  if (w < breakpoints.xl) return 'xl'
  return '2xl'
}

function recompute() {
  const w = window.innerWidth
  const bp = widthToBreakpoint(w)
  if (bp !== cachedState.breakpoint || w !== cachedState.width) {
    cachedState = { breakpoint: bp, width: w }
    notifySubscribers()
  }
}

let subscribers: Set<() => void> = new Set()

function notifySubscribers() {
  for (const cb of subscribers) cb()
}

function subscribeToScreen(callback: () => void) {
  if (listenerCount === 0) {
    // First subscriber — create matchMedia queries and wire them up.
    for (const bp of Object.keys(breakpoints) as Breakpoint[]) {
      const mql = window.matchMedia(
        bp === '2xl'
          ? `(min-width: ${breakpoints['2xl']}px)`
          : bp === 'sm'
            ? `(max-width: ${breakpoints.sm - 1}px)`
            : `(min-width: ${breakpoints[bp]}px)`
      )
      mql.addEventListener('change', recompute)
      mediaQueries.push({ bp, mql })
    }
    cachedState = getInitialBreakpoint()
  }
  listenerCount++
  subscribers.add(callback)

  return () => {
    subscribers.delete(callback)
    listenerCount--
    if (listenerCount === 0) {
      for (const { mql } of mediaQueries) {
        mql.removeEventListener('change', recompute)
      }
      mediaQueries.length = 0
      subscribers = new Set()
    }
  }
}

function getScreenSnapshot(): ScreenState {
  return cachedState
}

function getScreenServerSnapshot(): ScreenState {
  return { breakpoint: 'lg', width: 1024 }
}

// Hook to detect current screen size — module-private; the surviving hooks
// need it but nothing outside does.
const useScreenSize = () => {
  const state = useSyncExternalStore(subscribeToScreen, getScreenSnapshot, getScreenServerSnapshot)
  return { screenSize: state.breakpoint, width: state.width }
}

// Hook to check if screen is mobile
export const useIsMobile = () => {
  const { width } = useScreenSize()
  return width < breakpoints.sm
}

// Network-aware loading for mobile
interface NetworkConnection extends EventTarget {
  effectiveType?: string
}

function getConnection(): NetworkConnection | undefined {
  if (typeof navigator === 'undefined') return undefined
  const nav = navigator as Navigator & {
    connection?: NetworkConnection
    mozConnection?: NetworkConnection
    webkitConnection?: NetworkConnection
  }
  return nav.connection || nav.mozConnection || nav.webkitConnection
}

function subscribeToConnection(callback: () => void) {
  const connection = getConnection()
  if (!connection) return () => {}
  connection.addEventListener('change', callback)
  return () => connection.removeEventListener('change', callback)
}

export const useNetworkAware = () => {
  const connectionType = useSyncExternalStore(
    subscribeToConnection,
    () => getConnection()?.effectiveType || 'unknown',
    () => 'unknown'
  )
  const isSlowConnection = ['slow-2g', '2g'].includes(connectionType)

  return {
    connectionType,
    isSlowConnection,
    shouldOptimize: isSlowConnection,
  }
}

// Responsive card layout utilities
export const useResponsiveCardLayout = () => {
  const { screenSize } = useScreenSize()

  const getCardGridClass = (itemCount: number): string => {
    if (screenSize === 'sm') {
      return 'grid-cols-1'
    } else if (screenSize === 'md') {
      return itemCount <= 1 ? 'grid-cols-1' : 'grid-cols-2'
    } else {
      return itemCount <= 2 ? 'grid-cols-2' : itemCount <= 3 ? 'grid-cols-3' : 'grid-cols-4'
    }
  }

  const getCardSize = (): 'compact' | 'normal' | 'large' => {
    if (screenSize === 'sm') return 'compact'
    if (screenSize === 'md') return 'normal'
    return 'large'
  }

  return {
    getCardGridClass,
    getCardSize,
  }
}

// Modal responsive utilities
export const useResponsiveModal = () => {
  const { screenSize } = useScreenSize()

  const getModalSize = (): string => {
    if (screenSize === 'sm') {
      return 'w-full h-full m-0 rounded-none' // Fullscreen on mobile
    } else if (screenSize === 'md') {
      return 'w-11/12 max-w-lg rounded-lg'
    } else {
      return 'w-full max-w-2xl rounded-lg'
    }
  }

  const getModalPosition = (): string => {
    if (screenSize === 'sm') {
      return 'inset-0' // Fullscreen positioning
    } else {
      return 'inset-4 m-auto'
    }
  }

  const shouldUseDrawer = (): boolean => {
    return screenSize === 'sm'
  }

  return {
    getModalSize,
    getModalPosition,
    shouldUseDrawer,
  }
}
