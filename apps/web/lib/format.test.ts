import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatBrowser,
  formatDevice,
  formatISO,
  formatLocalShort,
  formatLocation,
  formatOs,
  formatRelative,
} from './format'

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('< 1 minute: "just now"', () => {
    expect(formatRelative(Date.now() - 30_000)).toBe('just now')
  })
  it('< 1 hour: m ago', () => {
    expect(formatRelative(Date.now() - 5 * 60_000)).toBe('5m ago')
  })
  it('< 1 day: h ago', () => {
    expect(formatRelative(Date.now() - 2 * 3_600_000)).toBe('2h ago')
  })
  it('>= 1 day: d ago', () => {
    expect(formatRelative(Date.now() - 3 * 86_400_000)).toBe('3d ago')
  })
})

describe('formatISO', () => {
  it('returns YYYY-MM-DD HH:MM:SSZ', () => {
    expect(formatISO(new Date('2026-06-01T12:34:56Z').getTime())).toBe(
      '2026-06-01 12:34:56Z',
    )
  })
})

describe('formatLocation', () => {
  it('returns "—" for all-null', () => {
    expect(formatLocation({})).toBe('—')
    expect(
      formatLocation({ city: null, region: null, country: null }),
    ).toBe('—')
  })
  it('city, regionCode, country in order', () => {
    expect(
      formatLocation({ city: 'Miami', regionCode: 'FL', country: 'US' }),
    ).toBe('Miami, FL, US')
  })
  it('falls back to region when regionCode is missing', () => {
    expect(
      formatLocation({ city: 'Miami', region: 'Florida', country: 'US' }),
    ).toBe('Miami, Florida, US')
  })
})

describe('formatBrowser', () => {
  it('returns "—" when name missing', () => {
    expect(formatBrowser({})).toBe('—')
  })
  it('appends major version only', () => {
    expect(formatBrowser({ browserName: 'Chrome', browserVersion: '120.5.6789.50' })).toBe(
      'Chrome 120',
    )
  })
  it('handles missing version', () => {
    expect(formatBrowser({ browserName: 'Firefox' })).toBe('Firefox')
  })
})

describe('formatOs', () => {
  it('returns "—" when name missing', () => {
    expect(formatOs({})).toBe('—')
  })
  it('joins name + version', () => {
    expect(formatOs({ osName: 'Windows', osVersion: '11' })).toBe('Windows 11')
  })
  it('handles missing version', () => {
    expect(formatOs({ osName: 'macOS' })).toBe('macOS')
  })
})

describe('formatDevice', () => {
  it('returns "desktop" default', () => {
    expect(formatDevice({})).toBe('desktop')
  })
  it('vendor + model when both present', () => {
    expect(formatDevice({ deviceVendor: 'Apple', deviceModel: 'iPhone' })).toBe(
      'Apple iPhone',
    )
  })
  it('model alone when vendor missing', () => {
    expect(formatDevice({ deviceModel: 'Pixel 9' })).toBe('Pixel 9')
  })
  it('falls back to type', () => {
    expect(formatDevice({ deviceType: 'mobile' })).toBe('mobile')
  })
})

describe('formatLocalShort', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns time-only for today', () => {
    const out = formatLocalShort(Date.now() - 2 * 3_600_000)
    expect(out).toMatch(/AM|PM/)
    // No month name when same day.
    expect(out).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)
  })

  it('returns month + day + time for past days', () => {
    const out = formatLocalShort(new Date('2026-06-10T15:00:00Z').getTime())
    expect(out).toMatch(/Jun/)
  })
})
