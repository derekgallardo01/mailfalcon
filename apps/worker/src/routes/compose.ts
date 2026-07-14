import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { googleTokens } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import {
  GMAIL_COMPOSE_SCOPES,
  exchangeAndStoreGoogleTokens,
} from '../lib/google-tokens'
import { createLogger, errorMeta } from '../lib/logger'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  PUBLIC_WEB_URL?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export const composeRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * GET /v1/compose/oauth/authorize — returns the Google authorize URL
 * the web app should open in a popup or same-window redirect. Uses
 * PKCE so no client secret ever hits the browser.
 *
 * Web app is expected to:
 *   1. Generate a random code_verifier (43-128 chars).
 *   2. Derive code_challenge = base64url(sha256(code_verifier)).
 *   3. POST to this endpoint with { codeChallenge, redirectUri }.
 *   4. Open the returned url in a popup / new tab.
 *   5. When Google redirects back with ?code=..., POST it here at
 *      /callback with the original code_verifier.
 */
const authorizeSchema = z.object({
  codeChallenge: z.string().min(43).max(128),
  redirectUri: z.string().url().max(500),
})

composeRouter.post('/oauth/authorize', async (c) => {
  if (!c.env.GOOGLE_OAUTH_CLIENT_ID) {
    return c.json({ error: 'oauth_not_configured' }, 503)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = authorizeSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: parsed.data.redirectUri,
    response_type: 'code',
    scope: GMAIL_COMPOSE_SCOPES,
    code_challenge: parsed.data.codeChallenge,
    code_challenge_method: 'S256',
    // access_type=offline + prompt=consent guarantees a refresh_token
    // even for users who've previously granted these scopes.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  return c.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  })
})

const callbackSchema = z.object({
  code: z.string().min(1).max(2000),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(500),
})

composeRouter.post('/oauth/callback', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = callbackSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  try {
    const result = await exchangeAndStoreGoogleTokens(db, c.env, {
      userId,
      code: parsed.data.code,
      codeVerifier: parsed.data.codeVerifier,
      redirectUri: parsed.data.redirectUri,
    })
    createLogger({ env: c.env }).info('gmail_connected', {
      userId,
      googleEmail: result.googleEmail,
    })
    return c.json({ ok: true, googleEmail: result.googleEmail })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    createLogger({ env: c.env }).warn('gmail_connect_failed', {
      userId,
      ...errorMeta(err),
    })
    return c.json({ error: 'gmail_connect_failed', reason: msg }, 502)
  }
})

/** GET /v1/compose/oauth/status — is Gmail connected? Which address? */
composeRouter.get('/oauth/status', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      googleEmail: googleTokens.googleEmail,
      scopes: googleTokens.scopes,
      connectedAt: googleTokens.connectedAt,
      lastUsedAt: googleTokens.lastUsedAt,
    })
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId))
    .get()
  if (!row) {
    return c.json({ connected: false })
  }
  // Detect scope drift so the UI can prompt for re-consent when we
  // ship new features that require additional scopes.
  const grantedScopes = row.scopes.split(' ').filter(Boolean)
  const requiredScopes = GMAIL_COMPOSE_SCOPES.split(' ')
  const missing = requiredScopes.filter((s) => !grantedScopes.includes(s))
  return c.json({
    connected: true,
    googleEmail: row.googleEmail,
    connectedAt: row.connectedAt,
    lastUsedAt: row.lastUsedAt,
    scopesUpToDate: missing.length === 0,
    missingScopes: missing,
  })
})

/** DELETE /v1/compose/oauth — disconnect Gmail. Deletes local tokens;
 *  doesn't call Google's revoke endpoint (user can revoke via Google
 *  account settings if they want to remove the grant entirely). */
composeRouter.delete('/oauth', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId)).run()
  createLogger({ env: c.env }).info('gmail_disconnected', { userId })
  return c.json({ ok: true })
})
