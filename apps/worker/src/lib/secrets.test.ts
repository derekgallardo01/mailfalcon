import { describe, expect, it } from 'vitest'
import { getHmacSecret } from './secrets'

describe('getHmacSecret', () => {
  it('returns the configured secret when present', () => {
    expect(
      getHmacSecret({ HMAC_SECRET: 'real-secret', ENVIRONMENT: 'production' }),
    ).toBe('real-secret')
  })

  it('falls back to the dev secret in development', () => {
    const v = getHmacSecret({ ENVIRONMENT: 'development' })
    expect(v).toBe('mailfalcon-dev-insecure')
  })

  it('throws in production when the secret is missing', () => {
    expect(() => getHmacSecret({ ENVIRONMENT: 'production' })).toThrow(
      /HMAC_SECRET/,
    )
  })

  it('throws for any unknown environment when secret is missing', () => {
    expect(() => getHmacSecret({ ENVIRONMENT: 'staging' })).toThrow(
      /HMAC_SECRET/,
    )
  })
})
