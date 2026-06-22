import { describe, expect, it } from 'vitest'
import { newSalt, newTrackingId } from './ids'

describe('newTrackingId', () => {
  it('returns a base64url-safe string', () => {
    const id = newTrackingId()
    expect(id).not.toMatch(/[+/=]/)
  })

  it('is unique across 1000 invocations (collision-free entropy)', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(newTrackingId())
    expect(set.size).toBe(1000)
  })

  it('encodes 16 random bytes ≈ 22 base64url chars', () => {
    const id = newTrackingId()
    expect(id.length).toBe(22)
  })
})

describe('newSalt', () => {
  it('returns a base64url-safe string', () => {
    const s = newSalt()
    expect(s).not.toMatch(/[+/=]/)
  })

  it('is unique across 1000 invocations', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(newSalt())
    expect(set.size).toBe(1000)
  })
})
