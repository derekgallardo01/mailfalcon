import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetToEpoch } from './scheduled'

describe('presetToEpoch', () => {
  beforeEach(() => {
    // Pin time to a known moment: 2026-06-01 12:00:00 UTC.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('in-1h returns now + 1 hour', () => {
    const out = presetToEpoch('in-1h')
    expect(out - Date.now()).toBe(60 * 60 * 1000)
  })

  it('in-3h returns now + 3 hours', () => {
    const out = presetToEpoch('in-3h')
    expect(out - Date.now()).toBe(3 * 60 * 60 * 1000)
  })

  it('tomorrow-9am returns 9am the next day (local)', () => {
    const out = presetToEpoch('tomorrow-9am')
    const dt = new Date(out)
    // We expect "next day at 09:00" in the runner's local timezone.
    // The test is robust to TZ by checking it's >= 9h ahead and < 33h.
    const diff = out - Date.now()
    expect(diff).toBeGreaterThan(9 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(33 * 60 * 60 * 1000)
    expect(dt.getHours()).toBe(9)
    expect(dt.getMinutes()).toBe(0)
    expect(dt.getSeconds()).toBe(0)
  })
})
