import { NextRequest, NextResponse } from 'next/server'

/**
 * Pins an already-encrypted document blob to IPFS via Pinata.
 *
 * The client encrypts client-side (see src/lib/ipfs.ts) and posts the raw
 * ciphertext bytes here as the request body — this route never sees
 * plaintext. `PINATA_JWT` is a server-only env var (no `NEXT_PUBLIC_` prefix)
 * so the credential never reaches the client bundle.
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json(
      { error: 'Document uploads are not configured on the server (PINATA_JWT is unset).' },
      { status: 503 }
    )
  }

  const body = await req.arrayBuffer()
  if (body.byteLength === 0) {
    return NextResponse.json({ error: 'Empty upload' }, { status: 400 })
  }

  const form = new FormData()
  form.append('file', new Blob([body]), 'document')

  let res: Response
  try {
    // TODO #145: Server-side Pinata call has no timeout or abort signal.
    // A hung Pinata API holds this route handler open indefinitely instead of
    // returning an error response. See src/lib/ipfs.ts for detailed improvement
    // strategy. Should apply AbortSignal.timeout(SERVER_PINATA_TIMEOUT_MS).
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach the pinning provider' }, { status: 502 })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Pinning provider rejected the upload (${res.status})${detail ? `: ${detail}` : ''}` },
      { status: 502 }
    )
  }

  const data = (await res.json()) as { IpfsHash: string }
  return NextResponse.json({ hash: data.IpfsHash })
}
