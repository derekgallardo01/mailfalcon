import { describe, expect, it, vi } from 'vitest'
import { asKv, MockKV } from '../test-utils/mock-kv'
import * as adminModule from './admin'

describe('getCachedStats', () => {
  it('caches stats in memory and KV, avoiding repeated computeStats calls', async () => {
    const mockDb = {} as any
    const kv = new MockKV()
    const env = { KV: asKv(kv) }

    const fakeStats: adminModule.AdminStats = {
      revenue: { mrrCents: 1400, activeSubs: 2 },
      totals: { users: 10, emails: 50, events: 100 },
      usersByTier: { free: 8, pro: 2, team: 0, admin: 1 },
      today: { newUsers: 1, emailsSent: 5, eventsLogged: 20 },
      telemetry: { installedNeverSent: 2, activated: 5, active7d: 7 },
    }

    const computeSpy = vi.fn().mockResolvedValue(fakeStats)

    // 1st call: computeStats is called, cached in memory & KV
    const res1 = await adminModule.getCachedStats(mockDb, env, undefined, 60, computeSpy)
    expect(res1).toEqual(fakeStats)
    expect(computeSpy).toHaveBeenCalledTimes(1)

    // 2nd call: served from memory cache, computeStats not called
    const res2 = await adminModule.getCachedStats(mockDb, env, undefined, 60, computeSpy)
    expect(res2).toEqual(fakeStats)
    expect(computeSpy).toHaveBeenCalledTimes(1)

    // Verify written to KV
    const inKv = await kv.get('cache:admin:stats', 'json')
    expect(inKv).toEqual(fakeStats)

    computeSpy.mockRestore()
  })
})
