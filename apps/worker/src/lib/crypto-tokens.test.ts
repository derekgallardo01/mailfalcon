import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, isEncrypted } from './crypto-tokens'

// A valid 32-byte key, base64-encoded (btoa of 32 ASCII bytes).
const KEY = btoa('x'.repeat(32))
const envWithKey = { TOKEN_ENC_KEY: KEY }
const envNoKey = {}

describe('crypto-tokens', () => {
  it('round-trips a token through encrypt/decrypt', async () => {
    const plaintext = '1//refresh-token-abc123.def456'
    const enc = await encryptToken(plaintext, envWithKey)
    expect(enc).not.toBe(plaintext)
    expect(isEncrypted(enc)).toBe(true)
    expect(await decryptToken(enc, envWithKey)).toBe(plaintext)
  })

  it('produces a fresh IV each call (ciphertext differs)', async () => {
    const a = await encryptToken('same', envWithKey)
    const b = await encryptToken('same', envWithKey)
    expect(a).not.toBe(b)
    expect(await decryptToken(a, envWithKey)).toBe('same')
    expect(await decryptToken(b, envWithKey)).toBe('same')
  })

  it('treats un-prefixed values as legacy plaintext on decrypt', async () => {
    const legacy = 'legacy-plaintext-token'
    expect(isEncrypted(legacy)).toBe(false)
    expect(await decryptToken(legacy, envWithKey)).toBe(legacy)
  })

  it('returns plaintext unchanged when no key is configured', async () => {
    const plaintext = 'no-key-dev-mode'
    const enc = await encryptToken(plaintext, envNoKey)
    expect(enc).toBe(plaintext)
    expect(isEncrypted(enc)).toBe(false)
  })

  it('throws when decrypting an encrypted value without a key', async () => {
    const enc = await encryptToken('secret', envWithKey)
    await expect(decryptToken(enc, envNoKey)).rejects.toThrow(
      /token_enc_key_missing/,
    )
  })

  it('rejects a key of the wrong length', async () => {
    const badEnv = { TOKEN_ENC_KEY: btoa('short') }
    await expect(encryptToken('x', badEnv)).rejects.toThrow(
      /token_enc_key_invalid_length/,
    )
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const enc = await encryptToken('secret', envWithKey)
    // Flip a character in the base64 body to simulate tampering.
    const body = enc.slice('enc:v1:'.length)
    const tamperedChar = body[0] === 'A' ? 'B' : 'A'
    const tampered = `enc:v1:${tamperedChar}${body.slice(1)}`
    await expect(decryptToken(tampered, envWithKey)).rejects.toThrow()
  })
})
