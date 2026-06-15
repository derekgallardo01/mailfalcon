import { describe, expect, it } from 'vitest'
import { asKv, MockKV } from '../test-utils/mock-kv'
import { concurrentDec, concurrentInc, rateLimit } from './rate-limit'

describe('rateLimit', () => {
  it('allows requests up to the limit', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 5; i++) {
      const res = await rateLimit(asKv(kv), 'key', 5, 60)
      expect(res.allowed).toBe(true)
    }
  })

  it('rejects once limit is reached', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 5; i++) {
      await rateLimit(asKv(kv), 'key', 5, 60)
    }
    const res = await rateLimit(asKv(kv), 'key', 5, 60)
    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
  })

  it('decreases remaining by one each call', async () => {
    const kv = new MockKV()
    const a = await rateLimit(asKv(kv), 'key', 3, 60)
    const b = await rateLimit(asKv(kv), 'key', 3, 60)
    const c = await rateLimit(asKv(kv), 'key', 3, 60)
    expect([a.remaining, b.remaining, c.remaining]).toEqual([2, 1, 0])
  })

  it('keeps separate buckets per key', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 5; i++) {
      await rateLimit(asKv(kv), 'a', 5, 60)
    }
    const otherKey = await rateLimit(asKv(kv), 'b', 5, 60)
    expect(otherKey.allowed).toBe(true)
  })

  it('resets when the TTL expires', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 5; i++) {
      await rateLimit(asKv(kv), 'key', 5, 60)
    }
    expect((await rateLimit(asKv(kv), 'key', 5, 60)).allowed).toBe(false)
    kv._expire('key')
    expect((await rateLimit(asKv(kv), 'key', 5, 60)).allowed).toBe(true)
  })
})

describe('concurrent inc/dec', () => {
  it('counts up and back down', async () => {
    const kv = new MockKV()
    expect(await concurrentInc(asKv(kv), 'k', 60)).toBe(1)
    expect(await concurrentInc(asKv(kv), 'k', 60)).toBe(2)
    expect(await concurrentInc(asKv(kv), 'k', 60)).toBe(3)
    await concurrentDec(asKv(kv), 'k', 60)
    expect(await concurrentInc(asKv(kv), 'k', 60)).toBe(3)
  })

  it('deletes the key when the count reaches zero', async () => {
    const kv = new MockKV()
    await concurrentInc(asKv(kv), 'k', 60)
    await concurrentDec(asKv(kv), 'k', 60)
    expect(kv._size()).toBe(0)
  })

  it('floors at zero, never negative', async () => {
    const kv = new MockKV()
    await concurrentDec(asKv(kv), 'k', 60)
    await concurrentDec(asKv(kv), 'k', 60)
    expect(kv._size()).toBe(0)
  })
})
