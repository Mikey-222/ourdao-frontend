// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_UPLOAD_BYTES, POST } from '@/app/api/documents/route'

function upload(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/documents', {
    method: 'POST',
    body,
    headers,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as ConstructorParameters<typeof NextRequest>[1])
}

function chunkedStream(chunks: Uint8Array[]) {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++])
      else controller.close()
    },
  })
}

describe('POST /api/documents', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'test-jwt')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns 503 when PINATA_JWT is unset', async () => {
    vi.stubEnv('PINATA_JWT', '')
    const res = await POST(upload(new Uint8Array([1])))
    expect(res.status).toBe(503)
  })

  it('returns 400 for an empty body', async () => {
    const res = await POST(upload(new Uint8Array(0)))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pins the body and returns the hash', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: 'Qm123' }), { status: 200 }))
    const res = await POST(upload(new Uint8Array([1, 2, 3])))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hash: 'Qm123' })
  })

  it('rejects a declared Content-Length over the cap with 413, without reading the body', async () => {
    const res = await POST(upload(new Uint8Array([1]), { 'content-length': String(MAX_UPLOAD_BYTES + 1) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/16 MB/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a chunked body that exceeds the cap mid-stream with 413', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    const stream = chunkedStream(Array.from({ length: 17 }, () => chunk))
    const res = await POST(upload(stream))
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a chunked body exactly at the cap', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: 'QmMax' }), { status: 200 }))
    const chunk = new Uint8Array(1024 * 1024)
    const res = await POST(upload(chunkedStream(Array.from({ length: 16 }, () => chunk))))
    expect(res.status).toBe(200)
  })

  it('returns 502 when the pinning provider is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    const res = await POST(upload(new Uint8Array([1])))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Could not reach the pinning provider')
  })

  it("does not echo the provider's error body; logs it server-side with a request id", async () => {
    const secret = '{"account":"acct_9f2","plan":"free","quota_used":"99%","request_id":"pinata-internal-1"}'
    fetchMock.mockResolvedValue(new Response(secret, { status: 401 }))
    const res = await POST(upload(new Uint8Array([1])))
    expect(res.status).toBe(502)
    const { error } = await res.json()
    expect(error).toMatch(/^Pinning provider rejected the upload \(request [0-9a-f-]{36}\)$/)
    expect(error).not.toContain('acct_9f2')
    expect(error).not.toContain('quota')
    const requestId = error.match(/request ([0-9a-f-]{36})/)![1]
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(requestId), secret)
  })

  it('still returns a generic error when the provider body cannot be read', async () => {
    const broken = { ok: false, status: 500, text: () => Promise.reject(new Error('boom')) } as unknown as Response
    fetchMock.mockResolvedValue(broken)
    const res = await POST(upload(new Uint8Array([1])))
    expect(res.status).toBe(502)
    expect(console.error).toHaveBeenCalled()
  })
})
