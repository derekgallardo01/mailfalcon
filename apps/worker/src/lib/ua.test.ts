import { describe, expect, it } from 'vitest'
import { classifyUa, extractCfGeo, hashUa, parseUa, truncateIpV4 } from './ua'

describe('parseUa', () => {
  it('returns "unknown" for null/empty', () => {
    expect(parseUa(null).uaClass).toBe('unknown')
    expect(parseUa(undefined).uaClass).toBe('unknown')
    expect(parseUa('').uaClass).toBe('unknown')
  })

  it('classifies known bots', () => {
    expect(parseUa('GoogleImageProxy/1.0').uaClass).toBe('bot')
    expect(parseUa('Mozilla/5.0 GoogleBot').uaClass).toBe('bot')
    expect(parseUa('curl/7.86.0').uaClass).toBe('bot')
    expect(parseUa('python-requests/2.28').uaClass).toBe('bot')
    expect(parseUa('Mozilla/5.0 (compatible; bingbot/2.0)').uaClass).toBe('bot')
  })

  it('classifies modern desktop browsers', () => {
    const chrome = parseUa(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
    expect(chrome.uaClass).toBe('desktop')
    expect(chrome.browserName?.toLowerCase()).toContain('chrome')
    expect(chrome.osName?.toLowerCase()).toContain('windows')
  })

  it('classifies iPhone as mobile', () => {
    const r = parseUa(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(r.uaClass).toBe('mobile')
  })

  it('classifies Android as mobile', () => {
    const r = parseUa(
      'Mozilla/5.0 (Linux; Android 14; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    )
    expect(r.uaClass).toBe('mobile')
  })
})

describe('classifyUa', () => {
  it('returns the uaClass directly', () => {
    expect(classifyUa('GoogleBot')).toBe('bot')
    expect(classifyUa('Mozilla/5.0 (iPhone)')).toBe('mobile')
  })
})

describe('truncateIpV4', () => {
  it('zeroes the last octet of an IPv4 address', () => {
    expect(truncateIpV4('192.168.1.42')).toBe('192.168.1.0')
    expect(truncateIpV4('10.0.0.5')).toBe('10.0.0.0')
  })

  it('truncates IPv6 to the first 4 groups', () => {
    expect(truncateIpV4('2606:4700:0000:0000:1234:5678:9abc:def0')).toBe(
      '2606:4700:0000:0000::',
    )
  })

  it('returns null for null/short/empty', () => {
    expect(truncateIpV4(null)).toBeNull()
    expect(truncateIpV4(undefined)).toBeNull()
    expect(truncateIpV4('')).toBeNull()
    expect(truncateIpV4('1.2.3')).toBeNull()
  })
})

describe('hashUa', () => {
  it('returns a 16-hex-char hash', async () => {
    const h = await hashUa('Mozilla/5.0 test')
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic', async () => {
    const a = await hashUa('agent')
    const b = await hashUa('agent')
    expect(a).toBe(b)
  })

  it('differs for different inputs', async () => {
    const a = await hashUa('alpha')
    const b = await hashUa('beta')
    expect(a).not.toBe(b)
  })
})

describe('extractCfGeo', () => {
  it('returns all-null for a bare request', () => {
    const req = new Request('https://example.com')
    expect(extractCfGeo(req)).toEqual({
      country: null,
      region: null,
      regionCode: null,
      city: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      timezone: null,
    })
  })

  it('extracts fields from a CF-style request', () => {
    const req = Object.assign(new Request('https://example.com'), {
      cf: {
        country: 'US',
        region: 'Florida',
        regionCode: 'FL',
        city: 'Miami',
        postalCode: '33101',
        latitude: '25.7617',
        longitude: '-80.1918',
        timezone: 'America/New_York',
      },
    })
    const geo = extractCfGeo(req)
    expect(geo.country).toBe('US')
    expect(geo.regionCode).toBe('FL')
    expect(geo.city).toBe('Miami')
    expect(geo.timezone).toBe('America/New_York')
  })

  it('treats empty strings as null', () => {
    const req = Object.assign(new Request('https://example.com'), {
      cf: { country: '', city: 'Miami' },
    })
    const geo = extractCfGeo(req)
    expect(geo.country).toBeNull()
    expect(geo.city).toBe('Miami')
  })

  it('treats non-string values as null', () => {
    const req = Object.assign(new Request('https://example.com'), {
      cf: { country: 123, city: 'Miami' },
    })
    const geo = extractCfGeo(req)
    expect(geo.country).toBeNull()
    expect(geo.city).toBe('Miami')
  })
})
