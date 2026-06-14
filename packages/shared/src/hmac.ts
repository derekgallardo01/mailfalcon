function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < u8.byteLength; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function sign(
  message: string,
  secret: string,
  byteLen = 12,
): Promise<string> {
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  return b64urlEncode(new Uint8Array(sig).slice(0, byteLen))
}

export async function verify(
  message: string,
  sigB64: string,
  secret: string,
  byteLen = 12,
): Promise<boolean> {
  const expected = await sign(message, secret, byteLen)
  if (expected.length !== sigB64.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigB64.charCodeAt(i)
  }
  return diff === 0
}
