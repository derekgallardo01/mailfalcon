import { describe, expect, it } from 'vitest'
import { isInQuietHours } from './quiet-hours'

describe('isInQuietHours', () => {
  it('returns false when start or end is null', () => {
    expect(
      isInQuietHours({
        quietStartMinute: null,
        quietEndMinute: 60,
        quietTimezone: 'UTC',
      }),
    ).toBe(false)
    expect(
      isInQuietHours({
        quietStartMinute: 60,
        quietEndMinute: null,
        quietTimezone: 'UTC',
      }),
    ).toBe(false)
  })

  it('returns false when start === end (disabled marker)', () => {
    expect(
      isInQuietHours(
        {
          quietStartMinute: 0,
          quietEndMinute: 0,
          quietTimezone: 'UTC',
        },
        new Date('2026-01-01T03:00:00Z'),
      ),
    ).toBe(false)
  })

  describe('non-crossing window (09:00–17:00 UTC)', () => {
    const cfg = {
      quietStartMinute: 9 * 60,
      quietEndMinute: 17 * 60,
      quietTimezone: 'UTC',
    }
    it('flags inside the window', () => {
      expect(isInQuietHours(cfg, new Date('2026-01-01T12:00:00Z'))).toBe(true)
      expect(isInQuietHours(cfg, new Date('2026-01-01T09:00:00Z'))).toBe(true)
      expect(isInQuietHours(cfg, new Date('2026-01-01T16:59:00Z'))).toBe(true)
    })
    it('rejects outside the window', () => {
      expect(isInQuietHours(cfg, new Date('2026-01-01T08:59:00Z'))).toBe(false)
      expect(isInQuietHours(cfg, new Date('2026-01-01T17:00:00Z'))).toBe(false)
      expect(isInQuietHours(cfg, new Date('2026-01-01T23:00:00Z'))).toBe(false)
    })
  })

  describe('cross-midnight window (22:00–08:00 UTC)', () => {
    const cfg = {
      quietStartMinute: 22 * 60,
      quietEndMinute: 8 * 60,
      quietTimezone: 'UTC',
    }
    it('flags late-night times', () => {
      expect(isInQuietHours(cfg, new Date('2026-01-01T22:00:00Z'))).toBe(true)
      expect(isInQuietHours(cfg, new Date('2026-01-01T23:30:00Z'))).toBe(true)
    })
    it('flags early-morning times', () => {
      expect(isInQuietHours(cfg, new Date('2026-01-01T01:00:00Z'))).toBe(true)
      expect(isInQuietHours(cfg, new Date('2026-01-01T07:59:00Z'))).toBe(true)
    })
    it('rejects mid-day times', () => {
      expect(isInQuietHours(cfg, new Date('2026-01-01T08:00:00Z'))).toBe(false)
      expect(isInQuietHours(cfg, new Date('2026-01-01T15:00:00Z'))).toBe(false)
    })
  })

  describe('timezone offsets', () => {
    it('respects America/New_York (UTC-5 standard, -4 DST)', () => {
      const cfg = {
        quietStartMinute: 22 * 60,
        quietEndMinute: 8 * 60,
        quietTimezone: 'America/New_York',
      }
      // 03:00 UTC during EST (Jan) = 22:00 prior day in New York → quiet.
      expect(isInQuietHours(cfg, new Date('2026-01-15T03:00:00Z'))).toBe(true)
      // 18:00 UTC = 13:00 EST → not quiet.
      expect(isInQuietHours(cfg, new Date('2026-01-15T18:00:00Z'))).toBe(false)
    })

    it('falls back to UTC on invalid tz string', () => {
      const cfg = {
        quietStartMinute: 22 * 60,
        quietEndMinute: 8 * 60,
        quietTimezone: 'Not/A_Real_Zone',
      }
      // 23:00 UTC → quiet under UTC fallback.
      expect(isInQuietHours(cfg, new Date('2026-01-01T23:00:00Z'))).toBe(true)
    })

    it('handles null timezone as UTC', () => {
      const cfg = {
        quietStartMinute: 22 * 60,
        quietEndMinute: 8 * 60,
        quietTimezone: null,
      }
      expect(isInQuietHours(cfg, new Date('2026-01-01T23:00:00Z'))).toBe(true)
    })
  })
})
