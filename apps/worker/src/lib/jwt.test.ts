import { describe, expect, it } from 'vitest'
import { getJwtSecret, signJwt, verifyJwt } from './jwt'

const SECRET = 'a-very-long-and-secret-string-for-tests'

describe('signJwt + verifyJwt', () => {
  it('roundtrips a valid payload', async () => {
    const token = await signJwt({ sub: 'user_1', jti: 'jti_1' }, SECRET)
    const payload = await verifyJwt(token, SECRET)
    expect(payload).toEqual({ sub: 'user_1', jti: 'jti_1' })
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt({ sub: 'user_1', jti: 'jti_1' }, SECRET)
    expect(await verifyJwt(token, 'other-secret')).toBeNull()
  })

  it('rejects a tampered token', async () => {
    const token = await signJwt({ sub: 'user_1', jti: 'jti_1' }, SECRET)
    // Flip a byte in the payload section (between the two dots).
    const parts = token.split('.')
    const tampered = `${parts[0]}.${parts[1]!.slice(0, -1)}X.${parts[2]}`
    expect(await verifyJwt(tampered, SECRET)).toBeNull()
  })

  it('rejects garbage input without throwing', async () => {
    expect(await verifyJwt('not-a-jwt', SECRET)).toBeNull()
    expect(await verifyJwt('', SECRET)).toBeNull()
  })
})

describe('getJwtSecret', () => {
  it('returns the configured secret when present', () => {
    expect(
      getJwtSecret({ JWT_SECRET: 'real-jwt', ENVIRONMENT: 'production' }),
    ).toBe('real-jwt')
  })

  it('falls back to a dev secret in development', () => {
    expect(getJwtSecret({ ENVIRONMENT: 'development' })).toMatch(/dev/)
  })

  it('throws in production when missing', () => {
    expect(() => getJwtSecret({ ENVIRONMENT: 'production' })).toThrow(
      /JWT_SECRET/,
    )
  })
})
