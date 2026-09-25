'use client'

import { useWallet } from '@/lib/wallet'

// Keyed by the network name Freighter reports (`walletNetwork`), not the
// passphrase.
const networkConfig: Record<string, { label: string; className: string }> = {
  PUBLIC: { label: 'Mainnet', className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
  TESTNET: { label: 'Testnet', className: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' },
  FUTURENET: { label: 'Futurenet', className: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200' },
}

export function NetworkBadge() {
  const { walletNetwork, isConnected } = useWallet()

  // No wallet connected: don't render a badge
  if (!isConnected || !walletNetwork) {
    return null
  }

  const config = networkConfig[walletNetwork] || {
    label: walletNetwork,
    className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  }

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
