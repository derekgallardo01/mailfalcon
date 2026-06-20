import { config } from '../config'
import { getSession } from '../auth-store'
import {
  GMAIL_READONLY_SCOPE,
  GOOGLE_CLIENT_ID,
  STORAGE_KEYS,
} from './oauth-config'

/** All token I/O runs in the SW so the access token never reaches the
 *  content script. */

export interface StoredTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  connectedEmail: string | null
}

const REDIRECT_URI = chromeRedirectUri()

function chromeRedirectUri(): string {
  if (
    typeof chrome === 'undefined' ||
    !chrome.identity?.getRedirectURL
  ) {
    return ''
  }
  // chrome.identity.getRedirectURL() returns
  //   https://<extension-id>.chromiumapp.org/
  return chrome.identity.getRedirectURL()
}

async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  const verifier = base64urlencode(buf)
  const challengeBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  const challenge = base64urlencode(new Uint8Array(challengeBytes))
  return { verifier, challenge }
}

function base64urlencode(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function mailfalconAuthHeader(): Promise<Record<string, string>> {
  const session = await getSession().catch(() => null)
  if (!session) throw new Error('not_signed_in_to_mailfalcon')
  return { Authorization: `Bearer ${session.token}` }
}

/**
 * Run the Google consent flow. Returns the persisted token bundle on
 * success. Throws on user cancel or worker error.
 */
export async function connectGoogle(): Promise<StoredTokens> {
  if (!REDIRECT_URI) throw new Error('chrome_identity_unavailable')
  const { verifier, challenge } = await generatePkcePair()
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: GMAIL_READONLY_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    }).toString()

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (redirect) => {
        const err = chrome.runtime.lastError
        if (err || !redirect) {
          reject(new Error(err?.message ?? 'auth_cancelled'))
          return
        }
        resolve(redirect)
      },
    )
  })

  const url = new URL(responseUrl)
  const code = url.searchParams.get('code')
  const errParam = url.searchParams.get('error')
  if (errParam) throw new Error(`google_consent_${errParam}`)
  if (!code) throw new Error('google_no_code')

  // Worker proxy exchange — it holds the client secret.
  const res = await fetch(`${config.apiHost}/v1/oauth/google/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await mailfalconAuthHeader()) },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`worker_exchange_failed:${res.status}:${detail}`)
  }
  const data = (await res.json()) as {
    accessToken: string
    refreshToken: string | null
    expiresIn: number
  }
  const expiresAt = Date.now() + Math.max(0, data.expiresIn - 60) * 1000

  // Look up the email on the new token so the popup can show
  // "Connected as foo@gmail.com".
  let email: string | null = null
  try {
    const profileRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${data.accessToken}` } },
    )
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { emailAddress?: string }
      email = profile.emailAddress ?? null
    }
  } catch {
    /* non-fatal */
  }

  const stored: StoredTokens = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt,
    connectedEmail: email,
  }
  await saveTokens(stored)
  return stored
}

export async function loadTokens(): Promise<StoredTokens | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.connectedEmail,
  ])
  const accessToken = stored[STORAGE_KEYS.accessToken] as string | undefined
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: (stored[STORAGE_KEYS.refreshToken] as string | null | undefined) ?? null,
    expiresAt: Number(stored[STORAGE_KEYS.expiresAt] ?? 0),
    connectedEmail:
      (stored[STORAGE_KEYS.connectedEmail] as string | null | undefined) ?? null,
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: tokens.accessToken,
    [STORAGE_KEYS.refreshToken]: tokens.refreshToken,
    [STORAGE_KEYS.expiresAt]: tokens.expiresAt,
    [STORAGE_KEYS.connectedEmail]: tokens.connectedEmail,
  })
}

export async function clearTokens(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local.remove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.connectedEmail,
  ])
}

/**
 * Returns a non-expired access token. Refreshes via the worker if
 * needed. Returns null if not connected OR if refresh fails (caller
 * should treat as "needs reconnect").
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens()
  if (!tokens) return null
  if (tokens.expiresAt > Date.now()) return tokens.accessToken
  if (!tokens.refreshToken) {
    await clearTokens()
    return null
  }
  try {
    const res = await fetch(`${config.apiHost}/v1/oauth/google/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await mailfalconAuthHeader()),
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    if (res.status === 401) {
      await clearTokens()
      return null
    }
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken: string; expiresIn: number }
    const next: StoredTokens = {
      ...tokens,
      accessToken: data.accessToken,
      expiresAt: Date.now() + Math.max(0, data.expiresIn - 60) * 1000,
    }
    await saveTokens(next)
    return next.accessToken
  } catch {
    return null
  }
}

/**
 * Best-effort revoke at Google's end. Local tokens are cleared even if
 * the network call fails.
 */
export async function disconnectGoogle(): Promise<void> {
  const tokens = await loadTokens()
  if (tokens) {
    const t = tokens.refreshToken ?? tokens.accessToken
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`,
        { method: 'POST' },
      )
    } catch {
      /* non-fatal */
    }
  }
  await clearTokens()
}
