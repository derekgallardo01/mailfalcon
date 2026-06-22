import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_HOST,
  DEFAULT_TRACKER_HOST,
  clickUrl,
  pixelUrl,
} from './urls'

describe('pixelUrl', () => {
  it('uses the default tracker host', () => {
    const url = pixelUrl('emailA', 'sigZ')
    expect(url).toBe(`${DEFAULT_TRACKER_HOST}/p/emailA.gif?s=sigZ`)
  })

  it('accepts a custom host', () => {
    const url = pixelUrl('emailA', 'sigZ', 'https://t.custom.com')
    expect(url).toBe('https://t.custom.com/p/emailA.gif?s=sigZ')
  })

  it('appends recipientId when provided', () => {
    const url = pixelUrl('emailA', 'sigZ', DEFAULT_TRACKER_HOST, 'r1')
    expect(url).toContain('&r=r1')
  })

  it('url-encodes recipientId', () => {
    const url = pixelUrl('emailA', 'sigZ', DEFAULT_TRACKER_HOST, 'r/1+2')
    expect(url).toContain('&r=r%2F1%2B2')
  })
})

describe('clickUrl', () => {
  it('default host + bare sig', () => {
    const url = clickUrl('emailA', 0, 'sigZ')
    expect(url).toBe(`${DEFAULT_TRACKER_HOST}/c/emailA/0?s=sigZ`)
  })

  it('honors link index', () => {
    expect(clickUrl('emailA', 5, 'sig')).toContain('/c/emailA/5?')
  })

  it('appends recipientId', () => {
    const url = clickUrl('emailA', 0, 'sigZ', DEFAULT_TRACKER_HOST, 'r1')
    expect(url).toContain('&r=r1')
  })
})

describe('DEFAULT hosts', () => {
  it('point at mailfalcon.app', () => {
    expect(DEFAULT_TRACKER_HOST).toBe('https://t.mailfalcon.app')
    expect(DEFAULT_API_HOST).toBe('https://api.mailfalcon.app')
  })
})
