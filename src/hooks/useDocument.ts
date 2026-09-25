'use client'

/**
 * Loads a document's content from IPFS. Unencrypted docs are fetched
 * automatically and cached by content hash (a plain read, so useQuery).
 * Decrypting an encrypted doc requires a user-supplied password each time —
 * downloadFromIPFS couples the ciphertext fetch and the decrypt into one call
 * keyed by that password, so there's no separately-cacheable ciphertext step
 * to hoist into a query without changing lib/ipfs.ts (out of scope here).
 * That combined fetch+decrypt is modeled as a mutation instead, since it's a
 * one-shot user action rather than data that should be cached or refetched.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { canAccessDocument, downloadFromIPFS, type DocumentMetadata } from '@/lib/ipfs'

const ACCESS_DENIED_MESSAGE = 'You do not have permission to view this doc'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to load doc'
}

export function useDocumentContent(
  doc: DocumentMetadata,
  userAddress: string,
  userRoles: string[] = []
) {
  const hasAccess = canAccessDocument(doc, userAddress, userRoles)

  const query = useQuery({
    queryKey: ['document', doc.hash, userAddress],
    queryFn: () => downloadFromIPFS(doc.hash, false),
    enabled: hasAccess && !doc.encrypted,
  })

  const decryptMutation = useMutation({
    mutationFn: (password: string) => downloadFromIPFS(doc.hash, true, password),
  })

  const decrypt = useCallback(
    (password: string) => {
      if (!hasAccess) return
      decryptMutation.mutate(password)
    },
    [hasAccess, decryptMutation]
  )

  const active = doc.encrypted ? decryptMutation : query
  const content = active.data?.content ?? null
  const decrypted = active.data?.decrypted ?? false
  const loading = doc.encrypted ? decryptMutation.isPending : query.isLoading
  const error = !hasAccess
    ? ACCESS_DENIED_MESSAGE
    : active.error
      ? errorMessage(active.error)
      : ''

  // TS's Uint8Array is generic over its buffer type as of TS 5.7+; BlobPart
  // requires an ArrayBuffer-backed one specifically, so copy into a fresh
  // Uint8Array to satisfy that (no behavior change).
  const previewUrl = useMemo(
    () => (content ? URL.createObjectURL(new Blob([new Uint8Array(content)], { type: doc.type })) : null),
    [content, doc.type]
  )

  // Revoke the previous URL once a new one is created, and on unmount —
  // never left dangling for the lifetime of the page.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  return { content, loading, error, decrypted, previewUrl, decrypt }
}
