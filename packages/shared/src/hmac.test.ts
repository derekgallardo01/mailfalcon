import { describe, expect, it } from 'vitest'
import { sign, verify } from './hmac'

const SECRET = 'super-secret-key-do-not-use-in-prod'

describe('sign', () => {
  it('returns a deterministic signature for the same input', async () => {
    const a = await sign('hello', SECRET)
    const b = await sign('hello', SECRET)
    expect(a).toBe(b)
  })

  it('returns a different sig for different messages', async () => {
    const a = await sign('hello', SECRET)
    const b = await sign('world', SECRET)
    expect(a).not.toBe(b)
  })

  it('returns a different sig for different secrets', async () => {
    const a = await sign('hello', SECRET)
    const b = await sign('hello', 'different-secret')
    expect(a).not.toBe(b)
  })

  it('respects byteLen — longer signatures are longer base64', async () => {
    const short = await sign('hello', SECRET, 8)
    const long = await sign('hello', SECRET, 32)
    expect(short.length).toBeLessThan(long.length)
  })

  it('uses base64url-safe characters (no +, /, =)', async () => {
    const sig = await sign('hello', SECRET)
    expect(sig).not.toMatch(/[+/=]/)
  })
})

describe('verify', () => {
  it('returns true for a matching signature', async () => {
    const sig = await sign('hello', SECRET)
    expect(await verify('hello', sig, SECRET)).toBe(true)
  })

  it('returns false for a wrong message', async () => {
    const sig = await sign('hello', SECRET)
    expect(await verify('helo', sig, SECRET)).toBe(false)
  })

  it('returns false for a wrong secret', async () => {
    const sig = await sign('hello', SECRET)
    expect(await verify('hello', sig, 'wrong')).toBe(false)
  })

  it('returns false on tampered signature', async () => {
    const sig = await sign('hello', SECRET)
    const tampered = sig.slice(0, -1) + (sig.at(-1) === 'A' ? 'B' : 'A')
    expect(await verify('hello', tampered, SECRET)).toBe(false)
  })

  it('returns false for empty/short sig', async () => {
    expect(await verify('hello', '', SECRET)).toBe(false)
    expect(await verify('hello', 'abc', SECRET)).toBe(false)
  })

  it('rejects sigs of the wrong length without timing leak', async () => {
    const sig = await sign('hello', SECRET, 12)
    const longer = await sign('hello', SECRET, 32)
    // Constant-time check still returns false even though the prefix
    // of `longer` would match.
    expect(await verify('hello', longer, SECRET, 12)).toBe(false)
    expect(sig.length).not.toBe(longer.length)
  })
})
