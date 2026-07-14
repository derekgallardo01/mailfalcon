/**
 * Client-side PKCE helper for the mobile-web compose Gmail connect flow.
 * The server holds the OAuth client secret; browser only does the PKCE
 * dance so the code exchange stays server-mediated.
 */

const VERIFIER_KEY = 'mf.google.oauth.codeVerifier'
const REDIRECT_KEY = 'mf.google.oauth.redirectUri'

/** RFC 7636 code_verifier: 43-128 chars from the URL-safe alphabet. */
function randomVerifier(): string {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256(input: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return new Uint8Array(buf)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generateChallenge(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = randomVerifier()
  const challenge = base64UrlEncode(await sha256(verifier))
  return { verifier, challenge }
}

/** Stash the verifier + redirect URI in sessionStorage so the callback
 *  page (a fresh document load post-redirect) can retrieve them. */
export function rememberVerifier(verifier: string, redirectUri: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(REDIRECT_KEY, redirectUri)
}

export function consumeVerifier(): {
  verifier: string | null
  redirectUri: string | null
} {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const redirectUri = sessionStorage.getItem(REDIRECT_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(REDIRECT_KEY)
  return { verifier, redirectUri }
}

/** Canonical redirect URI. Must match what's registered in Google
 *  Cloud Console AND what the server sends to Google at token
 *  exchange. Uses the current origin so dev/prod both work. */
export function composeRedirectUri(): string {
  return `${window.location.origin}/oauth/gmail/callback/`
}
