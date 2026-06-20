/** Public OAuth client config. The matching secret is held server-side
 *  (worker env: GOOGLE_OAUTH_CLIENT_SECRET) and never embedded here.
 *  Code-for-token exchange happens through the worker proxy.
 */
export const GOOGLE_CLIENT_ID =
  '982411285849-5kustbd0g8bm3g7024do8gb1epuur9m7.apps.googleusercontent.com'

export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly'

/** Storage keys for the persisted Google tokens. Stored in
 *  chrome.storage.local so they survive SW restarts but are cleared
 *  on sign-out + on explicit disconnect. */
export const STORAGE_KEYS = {
  accessToken: 'mf.google.accessToken',
  refreshToken: 'mf.google.refreshToken',
  expiresAt: 'mf.google.expiresAt',
  connectedEmail: 'mf.google.connectedEmail',
  enabled: 'mf.spoof.verifyEnabled',
} as const
