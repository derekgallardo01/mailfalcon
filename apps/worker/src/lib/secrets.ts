const DEV_FALLBACK = 'mailfalcon-dev-insecure'

export function getHmacSecret(env: { HMAC_SECRET?: string; ENVIRONMENT: string }): string {
  if (env.HMAC_SECRET) return env.HMAC_SECRET
  if (env.ENVIRONMENT === 'development') {
    console.warn('[mailfalcon] HMAC_SECRET unset; using dev fallback')
    return DEV_FALLBACK
  }
  throw new Error('HMAC_SECRET is required in non-dev environments')
}
