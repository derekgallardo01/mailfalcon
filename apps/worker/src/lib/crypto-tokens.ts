/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Google refresh/access tokens are long-lived credentials; storing them
 * as plaintext in D1 is a finding for CASA / Google restricted-scope
 * verification. We wrap them with a 256-bit key held only as a Workers
 * secret (`TOKEN_ENC_KEY`, base64 of 32 random bytes) so a database dump
 * alone cannot yield usable tokens.
 *
 * Stored format:  `enc:v1:` + base64( iv(12 bytes) || ciphertext+tag )
 *
 * Migration is lazy and backward-compatible: values without the `enc:v1:`
 * prefix are treated as legacy plaintext by `decryptToken`, and callers
 * re-persist them encrypted on the next write. No data migration needed.
 */

const PREFIX = 'enc:v1:'

interface CryptoEnv {
  TOKEN_ENC_KEY?: string
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

async function importKey(env: CryptoEnv): Promise<CryptoKey | null> {
  if (!env.TOKEN_ENC_KEY) return null
  const raw = base64ToBytes(env.TOKEN_ENC_KEY)
  if (raw.length !== 32) {
    throw new Error('token_enc_key_invalid_length')
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** True if `stored` is an encrypted value (has the enc:v1: envelope). */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

/**
 * Encrypt a token for storage. If `TOKEN_ENC_KEY` is not configured
 * (e.g. local dev), returns the plaintext unchanged so the app still
 * works — production sets the secret so this always encrypts.
 */
export async function encryptToken(
  plaintext: string,
  env: CryptoEnv,
): Promise<string> {
  const key = await importKey(env)
  if (!key) return plaintext
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  )
  const combined = new Uint8Array(iv.length + ct.length)
  combined.set(iv, 0)
  combined.set(ct, iv.length)
  return PREFIX + bytesToBase64(combined)
}

/**
 * Decrypt a stored token. Legacy plaintext values (no `enc:v1:` prefix)
 * are returned as-is to support in-place migration. Throws only if a
 * value is encrypted but no key is configured, or on tamper/corruption.
 */
export async function decryptToken(
  stored: string,
  env: CryptoEnv,
): Promise<string> {
  if (!isEncrypted(stored)) return stored
  const key = await importKey(env)
  if (!key) throw new Error('token_enc_key_missing')
  const combined = base64ToBytes(stored.slice(PREFIX.length))
  const iv = combined.slice(0, 12)
  const ct = combined.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}
