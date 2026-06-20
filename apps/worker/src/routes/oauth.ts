import { Hono } from 'hono'
import { z } from 'zod'
import type { Variables } from '../lib/auth-middleware'

type Bindings = {
  ENVIRONMENT: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
}

export const oauthRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

const REDIRECT_URI = 'https://flimjkffmcjdmbppckejndmihbnflldm.chromiumapp.org/'

const exchangeSchema = z.object({
  code: z.string().min(1).max(2000),
  codeVerifier: z.string().min(43).max(128),
})

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

/**
 * Server-side OAuth code exchange. The extension cannot embed the
 * client secret (Web-application clients are confidential), so it does
 * the PKCE auth flow client-side, then sends the auth code here. We
 * hold the secret and exchange with Google.
 */
oauthRouter.post('/google/exchange', async (c) => {
  if (!c.env.GOOGLE_OAUTH_CLIENT_ID || !c.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return c.json({ error: 'oauth_not_configured' }, 503)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = exchangeSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const params = new URLSearchParams({
    code: parsed.data.code,
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    code_verifier: parsed.data.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'google_exchange_failed', detail: text }, 502)
  }
  const data = (await res.json()) as GoogleTokenResponse
  return c.json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
    scope: data.scope ?? null,
  })
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(2000),
})

oauthRouter.post('/google/refresh', async (c) => {
  if (!c.env.GOOGLE_OAUTH_CLIENT_ID || !c.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return c.json({ error: 'oauth_not_configured' }, 503)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = refreshSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const params = new URLSearchParams({
    refresh_token: parsed.data.refreshToken,
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    // Most common failure mode is "invalid_grant" — the refresh token
    // was revoked by the user. Surface a distinct code so the extension
    // can prompt for re-consent rather than retry.
    if (res.status === 400 || res.status === 401) {
      return c.json({ error: 'refresh_revoked' }, 401)
    }
    return c.json({ error: 'google_refresh_failed', detail: text }, 502)
  }
  const data = (await res.json()) as GoogleTokenResponse
  return c.json({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  })
})
