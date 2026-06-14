import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'
const DEFAULT_TTL = 30 * 24 * 3600 // 30 days

export interface JwtPayload {
  sub: string
  jti: string
}

export async function signJwt(
  payload: JwtPayload,
  secret: string,
  ttlSeconds = DEFAULT_TTL,
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key)
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] })
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      return null
    }
    return { sub: payload.sub, jti: payload.jti }
  } catch {
    return null
  }
}

export function getJwtSecret(env: {
  JWT_SECRET?: string
  ENVIRONMENT: string
}): string {
  if (env.JWT_SECRET) return env.JWT_SECRET
  if (env.ENVIRONMENT === 'development') {
    return 'mailfalcon-dev-jwt-insecure'
  }
  throw new Error('JWT_SECRET is required in non-dev environments')
}
