import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { downloadFromIPFS, getIPFSUrl, uploadToIPFS, encryptData, decryptData } from '@/lib/ipfs'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response
}

function bytesResponse(bytes: Uint8Array, ok = true, status = ok ? 200 : 500) {
  return { ok, status, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as Response
}

describe('encryptData / decryptData', () => {
  it('round-trips plaintext through AES-GCM with a derived key', async () => {
    const plaintext = 'the loan document contents'
    const encrypted = await encryptData(plaintext, 'a strong password')
    expect(encrypted).not.toBe(plaintext)
    expect(await decryptData(encrypted, 'a strong password')).toBe(plaintext)
  })

  it('fails to decrypt with the wrong password', async () => {
    const encrypted = await encryptData('secret', 'correct password')
    await expect(decryptData(encrypted, 'wrong password')).rejects.toThrow()
  })
})

describe('uploadToIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the (unencrypted) file bytes to /api/documents and returns the pinned hash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmTestHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, false)

    expect(fetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'POST' }))
    expect(result.hash).toBe('QmTestHash')
    expect(result.encrypted).toBe(false)
  })

  it('encrypts before uploading when a password is given', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmEncryptedHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, true, 'a password')

    expect(result.encrypted).toBe(true)
    expect(result.hash).toBe('QmEncryptedHash')
    // The uploaded body is ciphertext, not the plaintext file content.
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const uploadedText = await (init!.body as Blob).text()
    expect(uploadedText).not.toContain('hello world')
  })

  it('throws with the server-provided error message on a non-2xx response, not a silent fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Document uploads are not configured on the server (PINATA_JWT is unset).' }, false, 503)
    )
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow(/PINATA_JWT/)
  })

  it('throws when the upload route is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow('network error')
  })
})

describe('downloadFromIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from the public gateway and returns the raw bytes when not encrypted', async () => {
    const bytes = new TextEncoder().encode('plain content')
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', false)

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('QmSomeHash'))
    expect(new TextDecoder().decode(result.content)).toBe('plain content')
    expect(result.decrypted).toBe(false)
  })

  it('decrypts the fetched bytes when encrypted and a password is given', async () => {
    const encrypted = await encryptData('secret contents', 'pw')
    const bytes = new TextEncoder().encode(encrypted)
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', true, 'pw')

    expect(new TextDecoder().decode(result.content)).toBe('secret contents')
    expect(result.decrypted).toBe(true)
  })

  it('throws a visible error when the gateway request fails, not a mock fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(new Uint8Array(), false, 404))
    await expect(downloadFromIPFS('QmMissing')).rejects.toThrow(/404/)
  })
})

describe('getIPFSUrl', () => {
  it('builds a URL against the configured gateway', () => {
    expect(getIPFSUrl('QmSomeHash')).toContain('QmSomeHash')
  })
})

describe('IPFS end-to-end binary round-trip', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a large non-UTF8 binary file (>150 KB) through upload and download', async () => {
    // 200 KB fixture containing non-UTF-8 byte sequences (e.g., 0xFF, 0x80, 0x00)
    const originalBytes = new Uint8Array(200_000)
    for (let i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = (i * 37) % 256
    }
    const file = new File([originalBytes], 'binary.dat', { type: 'application/octet-stream' })

    // Mock upload response
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmBinaryHash' }))

    const uploadResult = await uploadToIPFS(file, true, 'strong-pass')
    expect(uploadResult.hash).toBe('QmBinaryHash')

    // Extract posted ciphertext body from upload call
    const [, uploadInit] = vi.mocked(fetch).mock.calls[0]
    const uploadedBlob = uploadInit!.body as Blob
    const ciphertextBuffer = await uploadedBlob.arrayBuffer()
    const ciphertextBytes = new Uint8Array(ciphertextBuffer)

    // Mock download response returning the exact ciphertext
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(ciphertextBytes))

    const downloadResult = await downloadFromIPFS('QmBinaryHash', true, 'strong-pass')
    expect(downloadResult.content).toEqual(originalBytes)
  })
})

