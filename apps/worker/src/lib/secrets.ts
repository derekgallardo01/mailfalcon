const DEV_FALLBACK = 'mailfalcon-dev-insecure'

export function getHmacSecret(env: {
  HMAC_SECRET?: string
  ENVIRONMENT: string
}): string {
  if (env.HMAC_SECRET) return env.HMAC_SECRET
  if (env.ENVIRONMENT === 'development') return DEV_FALLBACK
  throw new Error('HMAC_SECRET is required outside development')
}
