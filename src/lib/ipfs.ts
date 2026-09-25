import { IPFS_GATEWAY } from '@/constants'

// Helper functions for chunked Base64 encoding/decoding without stack overflow
function bytesToBase64(bytes: Uint8Array): string {
  let binString = ''
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binString += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binString)
}

function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64)
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return bytes
}

export async function encryptBytes(data: Uint8Array, password: string): Promise<string> {
  const encoder = new TextEncoder()
  
  // Generate salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data as unknown as BufferSource
  )

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)

  return bytesToBase64(combined)
}

export async function decryptBytes(encryptedData: string, password: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const combined = base64ToBytes(encryptedData)

  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const encrypted = combined.slice(28)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  )

  return new Uint8Array(decrypted)
}

// Encryption utilities for string data
export async function encryptData(data: string, password: string): Promise<string> {
  return encryptBytes(new TextEncoder().encode(data), password)
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  const decryptedBytes = await decryptBytes(encryptedData, password)
  return new TextDecoder().decode(decryptedBytes)
}

// IPFS upload with encryption. Encryption happens here, client-side, before
// anything leaves the browser — the server route this posts to only ever
// sees the resulting ciphertext, never the plaintext file.
export async function uploadToIPFS(
  file: File,
  encrypt: boolean = false,
  password?: string
): Promise<{ hash: string; size: number; encrypted: boolean }> {
  const fileContent = new Uint8Array(await file.arrayBuffer())
  let processedData: Uint8Array

  if (encrypt && password) {
    const encryptedText = await encryptBytes(fileContent, password)
    processedData = new TextEncoder().encode(encryptedText)
  } else {
    processedData = fileContent
  }

  // TODO #145: Client-side document POST has no timeout. Server-side Pinata call
  // (route.ts:30) also unbounded. Gateway read (line 144) is worst of three.
  // Public gateways can be slow/unresponsive; stalled reads leave viewer spinning
  // with no error and no retry (no AbortSignal).
  //
  // IMPROVEMENT STRATEGY for all three fetches:
  // 1. Define separate named constants (not shared — uploads and gateway reads
  //    have different budgets):
  //    const CLIENT_UPLOAD_TIMEOUT_MS = 30000;    // 30s for reasonable uplinks
  //    const SERVER_PINATA_TIMEOUT_MS = 15000;    // 15s for server-side Pinata
  //    const GATEWAY_READ_TIMEOUT_MS = 8000;      // 8s for gateway reads (tightest)
  //
  // 2. Apply AbortSignal.timeout() to all three:
  //    - Here: const signal = AbortSignal.timeout(CLIENT_UPLOAD_TIMEOUT_MS)
  //    - route.ts:30 Pinata fetch: add { signal: AbortSignal.timeout(...) }
  //    - Line 144 gateway fetch: const signal = AbortSignal.timeout(GATEWAY_READ_TIMEOUT_MS)
  //
  // 3. Distinguish timeout errors from other failures so users see "Gateway stalled"
  //    (retryable) vs "Decryption failed" (permanent):
  //    if (error?.name === 'AbortError') {
  //      throw new Error('Document fetch timed out — gateway may be overloaded')
  //    }
  //
  // 4. Add test cases for timeout paths in test/ipfs.test.ts and
  //    test/useDocument.test.tsx. Note: Timing out a pin that Pinata actually
  //    completed leaves an orphaned pin (acceptable, but comment the trade-off).
  //
  // TS's Uint8Array is generic over its buffer type as of TS 5.7+; BlobPart
  // requires an ArrayBuffer-backed one specifically, so copy into a fresh
  // Uint8Array to satisfy that (no behavior change) — same fix as
  // DocumentViewer.tsx's preview blob.
  const res = await fetch('/api/documents', {
    method: 'POST',
    body: new Blob([new Uint8Array(processedData)]),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Document upload failed (${res.status})`)
  }

  const { hash } = (await res.json()) as { hash: string }

  return {
    hash,
    size: processedData.length,
    encrypted: encrypt,
  }
}

// TODO #145: IPFS gateway read has no timeout (see uploadToIPFS comment for details).
// This is the worst of the three fetches — public gateways are routinely slow or
// unresponsive. Without a timeout, DocumentViewer spins indefinitely with no error.
// Improvement: Apply AbortSignal.timeout(GATEWAY_READ_TIMEOUT_MS) here.
// IPFS download with decryption, read straight from the public gateway — no
// credential needed for reads.
export async function downloadFromIPFS(
  hash: string,
  encrypted: boolean = false,
  password?: string
): Promise<{ content: Uint8Array; decrypted: boolean }> {
  const res = await fetch(`${IPFS_GATEWAY}${hash}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch document from IPFS gateway (${res.status})`)
  }
  const fileData = new Uint8Array(await res.arrayBuffer())

  if (encrypted && password) {
    const encryptedText = new TextDecoder().decode(fileData)
    const content = await decryptBytes(encryptedText, password)
    return {
      content,
      decrypted: true,
    }
  }

  return {
    content: fileData,
    decrypted: false,
  }
}

// Get IPFS URL for direct access
export function getIPFSUrl(hash: string): string {
  return `${IPFS_GATEWAY}${hash}`
}

// Validate IPFS hash
export function validateIPFSHash(hash: string): boolean {
  // Basic validation for IPFS CID v0 and v1
  const cidV0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/
  const cidV1Regex = /^b[a-z2-7]{58}$/
  return cidV0Regex.test(hash) || cidV1Regex.test(hash)
}

/* AUDIT COMMENT - ISSUE #151 & #152 ANALYSIS:
 *
 * CURRENT STATUS: ❌ NEEDS FIXES
 *
 * ISSUE #151 - CID validation is too restrictive:
 * - cidV1Regex hard-codes exactly 59 characters via {58} quantifier
 * - Only accepts base32 prefix 'b', rejects other valid multibase prefixes (f, z, uppercase)
 * - Rejects valid CIDv1 with non-sha2-256 multihashes (different lengths)
 * - Example failures: 60-char CIDv1 strings, 'f'/'z'-prefixed CIDv1
 *
 * ISSUE #152 - Validator is never called:
 * - grep shows this function has exactly ONE occurrence (its declaration)
 * - getIPFSUrl (line 167-169) does bare string interpolation: `${IPFS_GATEWAY}${hash}`
 * - downloadFromIPFS (line 145) uses unvalidated hash in fetch URL
 * - No validation before contract calls either
 * - Malformed/malicious hashes flow straight through to URL construction
 *
 * REQUIRED FIXES:
 * 1. Relax cidV1Regex to accept variable-length hashes and multiple multibase prefixes
 *    - Support common prefixes: b (base32), f (base16), z (base58btc)
 *    - Use length range instead of fixed {58}: CIDv1 multibase has ~7-60 chars after prefix
 * 2. Add explicit comment documenting:
 *    - What IS accepted: CIDv0 (46 chars), CIDv1 with b/f/z prefixes (variable length)
 *    - What is NOT accepted: other multibase prefixes, malformed strings
 *    - This is a SHAPE CHECK only, not cryptographic proof
 * 3. Call validateIPFSHash() before URL construction:
 *    - Modify getIPFSUrl() to validate and throw on failure
 *    - Add validation to downloadFromIPFS() before fetch
 *    - Add validation before contract calls that use hashes
 * 4. Update test/ipfs.test.ts to cover:
 *    - CIDv0 pass case (already in test)
 *    - Common CIDv1 forms (bafybei..., bafkrei...)
 *    - 60-char CIDv1 (should pass after fix)
 *    - Non-base32 prefixes (f-, z-prefixed after fix)
 *    - Invalid formats rejection (clear error message)
 *
 * SUGGESTED UPGRADES:
 * - Consider using a proper CID library (multiformats/cid) for multihash validation
 *   + Pros: Full CID spec compliance, catches more errors
 *   + Cons: +~50KB bundle size for one validation function
 * - Alternative: Regex only but relaxed — accept more prefixes and lengths
 *   + Pros: No dependency, explicit set documented
 *   + Cons: Cannot validate multihash structure itself
 * - Add logging on validation failure (not hard errors initially)
 *   + Helps identify production issues without breaking existing documents
 *
 * SECURITY NOTE: This is NOT currently a security boundary. Hash validation
 * matters for UX (broken images) not security (no sanitization of output URL).
 * If later used as security control, proper URL encoding is also needed.
 */

// Generate document metadata
export interface DocumentMetadata {
  name: string
  type: string
  size: number
  uploadedAt: Date
  encrypted: boolean
  hash: string
  tags?: string[]
  permissions?: {
    public: boolean
    allowedUsers?: string[]
    allowedRoles?: string[]
  }
}

export function createDocumentMetadata(
  file: File,
  hash: string,
  encrypted: boolean,
  permissions?: DocumentMetadata['permissions']
): DocumentMetadata {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date(),
    encrypted,
    hash,
    permissions: permissions || { public: !encrypted }
  }
}

// Document access control
export function canAccessDocument(
  metadata: DocumentMetadata,
  userAddress: string,
  userRoles: string[] = []
): boolean {
  if (metadata.permissions?.public) {
    return true
  }

  // Stellar public keys are uppercase base32 (G… / C…, 56 chars).
  // Do NOT lowercase — the canonical form is all-caps and lowercasing the
  // needle means it can never match an address stored in canonical form.
  // Compare both sides as-is; callers are responsible for passing the address
  // in the same form it was stored (canonical uppercase for Stellar).
  if (metadata.permissions?.allowedUsers?.includes(userAddress)) {
    return true
  }
  
  if (metadata.permissions?.allowedRoles?.some(role => userRoles.includes(role))) {
    return true
  }
  
  return false
}

// Batch upload multiple documents
export async function uploadMultipleDocuments(
  files: File[],
  encrypt: boolean = false,
  password?: string,
  onProgress?: (progress: number) => void
): Promise<DocumentMetadata[]> {
  const results: DocumentMetadata[] = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const uploadResult = await uploadToIPFS(file, encrypt, password)
    const metadata = createDocumentMetadata(file, uploadResult.hash, encrypt)
    results.push(metadata)
    
    if (onProgress) {
      onProgress((i + 1) / files.length * 100)
    }
  }
  
  return results
}

// Document search and filtering
export interface DocumentFilter {
  type?: string
  encrypted?: boolean
  tags?: string[]
  dateFrom?: Date
  dateTo?: Date
  sizeMin?: number
  sizeMax?: number
}

export function filterDocuments(
  documents: DocumentMetadata[],
  filter: DocumentFilter
): DocumentMetadata[] {
  return documents.filter(doc => {
    if (filter.type && doc.type !== filter.type) return false
    if (filter.encrypted !== undefined && doc.encrypted !== filter.encrypted) return false
    if (filter.tags && !filter.tags.some(tag => doc.tags?.includes(tag))) return false
    if (filter.dateFrom && doc.uploadedAt < filter.dateFrom) return false
    if (filter.dateTo && doc.uploadedAt > filter.dateTo) return false
    if (filter.sizeMin && doc.size < filter.sizeMin) return false
    if (filter.sizeMax && doc.size > filter.sizeMax) return false
    return true
  })
}
