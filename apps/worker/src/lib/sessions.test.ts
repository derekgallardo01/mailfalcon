import { describe, expect, it } from 'vitest'
import { asKv, MockKV } from '../test-utils/mock-kv'
import { addSession, removeSession, sweepUserSessions } from './sessions'

const USER = 'user_1'

describe('addSession + removeSession', () => {
  it('roundtrips a jti through the index', async () => {
    const kv = new MockKV()
    await addSession(asKv(kv), USER, 'jti-a')
    await addSession(asKv(kv), USER, 'jti-b')

    const raw = await kv.get('sessions-by-user:user_1', 'json')
    expect(raw).toEqual(['jti-a', 'jti-b'])
  })

  it('is idempotent on duplicate adds', async () => {
    const kv = new MockKV()
    await addSession(asKv(kv), USER, 'jti-a')
    await addSession(asKv(kv), USER, 'jti-a')

    const raw = await kv.get('sessions-by-user:user_1', 'json')
    expect(raw).toEqual(['jti-a'])
  })

  it('removes a jti from the index', async () => {
    const kv = new MockKV()
    await addSession(asKv(kv), USER, 'jti-a')
    await addSession(asKv(kv), USER, 'jti-b')
    await removeSession(asKv(kv), USER, 'jti-a')

    const raw = await kv.get('sessions-by-user:user_1', 'json')
    expect(raw).toEqual(['jti-b'])
  })

  it('deletes the index when last entry is removed', async () => {
    const kv = new MockKV()
    await addSession(asKv(kv), USER, 'jti-a')
    await removeSession(asKv(kv), USER, 'jti-a')
    expect(kv._keys()).toEqual([])
  })

  it('caps the index at 20 entries (oldest evicted)', async () => {
    const kv = new MockKV()
    for (let i = 0; i < 25; i++) {
      await addSession(asKv(kv), USER, `jti-${i}`)
    }
    const raw = (await kv.get('sessions-by-user:user_1', 'json')) as string[]
    expect(raw).toHaveLength(20)
    expect(raw[0]).toBe('jti-5')
    expect(raw[19]).toBe('jti-24')
  })
})

describe('sweepUserSessions', () => {
  it('deletes every session:{jti} and clears the index', async () => {
    const kv = new MockKV()
    await kv.put('session:jti-a', 'x')
    await kv.put('session:jti-b', 'y')
    await kv.put('session:jti-c', 'z') // not indexed → not swept
    await addSession(asKv(kv), USER, 'jti-a')
    await addSession(asKv(kv), USER, 'jti-b')

    const n = await sweepUserSessions(asKv(kv), USER)
    expect(n).toBe(2)
    expect(await kv.get('session:jti-a')).toBeNull()
    expect(await kv.get('session:jti-b')).toBeNull()
    expect(await kv.get('session:jti-c')).toBe('z')
    expect(await kv.get('sessions-by-user:user_1')).toBeNull()
  })

  it('returns 0 when the user has no sessions', async () => {
    const kv = new MockKV()
    expect(await sweepUserSessions(asKv(kv), USER)).toBe(0)
  })
})
