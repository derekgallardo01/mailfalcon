import { describe, expect, it } from 'vitest'
import { asKv, MockKV } from '../test-utils/mock-kv'
import { checkAndIncrementUsage, getUsage } from './usage'

const USER = 'user_1'

describe('checkAndIncrementUsage — free tier', () => {
  it('allows up to the 10/day cap and blocks beyond', async () => {
    const kv = new MockKV()
    for (let i = 1; i <= 10; i++) {
      const res = await checkAndIncrementUsage(asKv(kv), USER, 'free')
      expect(res.allowed).toBe(true)
      expect(res.used).toBe(i)
      expect(res.limit).toBe(10)
    }
    const denied = await checkAndIncrementUsage(asKv(kv), USER, 'free')
    expect(denied.allowed).toBe(false)
    expect(denied.used).toBe(10)
  })

  it('reads the same counter on getUsage', async () => {
    const kv = new MockKV()
    await checkAndIncrementUsage(asKv(kv), USER, 'free')
    await checkAndIncrementUsage(asKv(kv), USER, 'free')
    await checkAndIncrementUsage(asKv(kv), USER, 'free')
    const u = await getUsage(asKv(kv), USER)
    expect(u).toEqual({ used: 3, limit: 10 })
  })

  it('keeps counters separate per user', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 10; i++) {
      await checkAndIncrementUsage(asKv(kv), 'alice', 'free')
    }
    const bob = await checkAndIncrementUsage(asKv(kv), 'bob', 'free')
    expect(bob.allowed).toBe(true)
    expect(bob.used).toBe(1)
  })
})

describe('checkAndIncrementUsage — paid tiers', () => {
  it.each(['pro', 'team', 'admin'] as const)(
    'never caps %s and never writes to KV',
    async (tier) => {
      const kv = new MockKV()
      for (let i = 0; i < 50; i++) {
        const res = await checkAndIncrementUsage(asKv(kv), USER, tier)
        expect(res.allowed).toBe(true)
      }
      // Paid tiers shouldn't burn KV writes.
      expect(kv._size()).toBe(0)
    },
  )
})

describe('getUsage', () => {
  it('returns 0 used when nothing was recorded', async () => {
    const kv = new MockKV()
    const u = await getUsage(asKv(kv), USER)
    expect(u.used).toBe(0)
  })
})
