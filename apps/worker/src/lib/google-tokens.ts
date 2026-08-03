import { eq } from 'drizzle-orm'
import { googleTokens } from '@mailfalcon/db/schema'
import type { DB } from './db'
import { decryptToken, encryptToken, isEncrypted } from './crypto-tokens'
import { createLogger, errorMeta } from './logger'

/** Scopes the server-mediated compose flow needs. Union of:
 *   - gmail.compose: create/read/update drafts, send messages
 *   - gmail.readonly: fetch source messages for reply context
 *   - openid + email + profile: get the connected Gmail address at
 *     callback time so we can display "Connected as x@gmail.com".
 *
 *  Keep this string identical to what we send to Google's authorize
 *  URL — Google echoes back the granted scope space-separated. */
export const GMAIL_COMPOSE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile',
].join(' ')

interface OAuthEnv {
  ENVIRONMENT: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  TOKEN_ENC_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

interface TokenRow {
  refreshToken: string
  accessToken: string | null
  accessTokenExpiresAt: number | null
  scopes: string
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  id_token?: string
}

/** Skew used when deciding "is the cached access token still fresh".
 *  Google access tokens live 1h; refresh 5 min before to absorb clock
 *  drift + long-running requests. */
const REFRESH_SKEW_MS = 5 * 60 * 1000

/**
 * Return a valid Gmail access token for `userId`, refreshing on-demand
 * if the cached one is expired or close to it. Persists any refresh
 * result back to the row so subsequent callers reuse it.
 *
 * Throws when:
 *   - no google_tokens row exists (user never connected)
 *   - refresh fails with 400/401 (refresh token revoked — user must
 *     re-consent in Settings)
 *   - Google is unreachable (bubbled up; caller decides retry policy)
 */
export async function getGoogleAccessToken(
  db: DB,
  env: OAuthEnv,
  userId: string,
): Promise<{ accessToken: string; googleEmail: string }> {
  const row = await db
    .select({
      googleEmail: googleTokens.googleEmail,
      refreshToken: googleTokens.refreshToken,
      accessToken: googleTokens.accessToken,
      accessTokenExpiresAt: googleTokens.accessTokenExpiresAt,
      scopes: googleTokens.scopes,
    })
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId))
    .get()
  if (!row) {
    throw new Error('gmail_not_connected')
  }

  const now = Date.now()
  if (
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt - now > REFRESH_SKEW_MS
  ) {
    // Cached token is still fresh; bump last_used_at asynchronously.
    void db
      .update(googleTokens)
      .set({ lastUsedAt: now })
      .where(eq(googleTokens.userId, userId))
      .run()
      .catch(() => undefined)
    return {
      accessToken: await decryptToken(row.accessToken, env),
      googleEmail: row.googleEmail,
    }
  }

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('oauth_not_configured')
  }
  const refreshToken = await decryptToken(row.refreshToken, env)
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    createLogger({ env }).warn('google_refresh_failed', {
      userId,
      status: res.status,
      detail: text.slice(0, 200),
    })
    if (res.status === 400 || res.status === 401) {
      throw new Error('refresh_revoked')
    }
    throw new Error(`refresh_failed_${res.status}`)
  }
  const data = (await res.json()) as GoogleTokenResponse
  const newExpiresAt = Date.now() + data.expires_in * 1000
  const updates: {
    accessToken: string
    accessTokenExpiresAt: number
    lastUsedAt: number
    refreshToken?: string
  } = {
    accessToken: await encryptToken(data.access_token, env),
    accessTokenExpiresAt: newExpiresAt,
    lastUsedAt: now,
  }
  // Lazily migrate a legacy plaintext refresh token to encrypted at rest
  // now that we hold the plaintext in memory (Google does not return a
  // new refresh token on refresh, so re-encrypt the existing one).
  if (!isEncrypted(row.refreshToken)) {
    updates.refreshToken = await encryptToken(refreshToken, env)
  }
  await db
    .update(googleTokens)
    .set(updates)
    .where(eq(googleTokens.userId, userId))
    .run()
  return { accessToken: data.access_token, googleEmail: row.googleEmail }
}

/**
 * Exchange an authorization code for tokens, extract the connected
 * Gmail address from the id_token, and persist to `google_tokens`.
 * Called from the OAuth callback route after the web app's popup
 * receives the code from Google.
 */
export async function exchangeAndStoreGoogleTokens(
  db: DB,
  env: OAuthEnv,
  args: {
    userId: string
    code: string
    codeVerifier: string
    redirectUri: string
  },
): Promise<{ googleEmail: string; scopes: string }> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('oauth_not_configured')
  }
  const params = new URLSearchParams({
    code: args.code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    code_verifier: args.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    createLogger({ env }).warn('google_compose_exchange_failed', {
      userId: args.userId,
      status: res.status,
      detail: text.slice(0, 200),
    })
    throw new Error(`exchange_failed_${res.status}`)
  }
  const data = (await res.json()) as GoogleTokenResponse
  if (!data.refresh_token) {
    // No refresh token means Google didn't consider this a fresh
    // consent — usually because the user has already granted these
    // scopes to this client. Force `prompt=consent` on the front-end
    // authorize URL to guarantee we always receive one.
    throw new Error('no_refresh_token_returned')
  }

  const googleEmail = extractEmailFromIdToken(data.id_token) ?? ''
  if (!googleEmail) {
    // Fall back to userinfo endpoint if id_token wasn't returned or
    // didn't include the email claim.
    try {
      const uiRes = await fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${data.access_token}` } },
      )
      if (uiRes.ok) {
        const ui = (await uiRes.json()) as { email?: string }
        if (ui.email) {
          return await persistTokens(db, env, args.userId, {
            googleEmail: ui.email,
            refreshToken: data.refresh_token,
            accessToken: data.access_token,
            expiresIn: data.expires_in,
            scope: data.scope ?? '',
          })
        }
      }
    } catch (err) {
      createLogger({ env }).warn('google_userinfo_failed', errorMeta(err))
    }
    throw new Error('email_extract_failed')
  }
  return await persistTokens(db, env, args.userId, {
    googleEmail,
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    scope: data.scope ?? '',
  })
}

async function persistTokens(
  db: DB,
  env: OAuthEnv,
  userId: string,
  t: {
    googleEmail: string
    refreshToken: string
    accessToken: string
    expiresIn: number
    scope: string
  },
): Promise<{ googleEmail: string; scopes: string }> {
  const now = Date.now()
  const refreshToken = await encryptToken(t.refreshToken, env)
  const accessToken = await encryptToken(t.accessToken, env)
  await db
    .insert(googleTokens)
    .values({
      userId,
      googleEmail: t.googleEmail,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: now + t.expiresIn * 1000,
      scopes: t.scope,
      connectedAt: now,
      lastUsedAt: now,
    })
    .onConflictDoUpdate({
      target: googleTokens.userId,
      set: {
        googleEmail: t.googleEmail,
        refreshToken,
        accessToken,
        accessTokenExpiresAt: now + t.expiresIn * 1000,
        scopes: t.scope,
        connectedAt: now,
        lastUsedAt: now,
      },
    })
    .run()
  return { googleEmail: t.googleEmail, scopes: t.scope }
}

/**
 * Best-effort revoke of a user's Google grant at Google's revoke
 * endpoint, then always caller-deletes the row. Revoking the refresh
 * token invalidates the whole grant. Called on disconnect + account
 * deletion so we don't leave a live grant dangling after we drop our
 * stored copy. Never throws — revocation is best-effort.
 */
export async function revokeGoogleGrant(
  db: DB,
  env: OAuthEnv,
  userId: string,
): Promise<void> {
  const row = await db
    .select({ refreshToken: googleTokens.refreshToken })
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId))
    .get()
  if (!row) return
  try {
    const token = await decryptToken(row.refreshToken, env)
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    )
  } catch (err) {
    createLogger({ env }).warn('google_revoke_failed', {
      userId,
      ...errorMeta(err),
    })
  }
}

/** Pull the `email` claim out of a Google id_token. The token is three
 *  base64url segments (header.payload.signature); we only need the
 *  payload and Google's signature is validated at token exchange. */
function extractEmailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]!
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(b64)
    const claims = JSON.parse(decoded) as { email?: string }
    return claims.email ?? null
  } catch {
    return null
  }
}
