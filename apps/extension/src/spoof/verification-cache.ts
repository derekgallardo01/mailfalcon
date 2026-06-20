import type { AuthResults } from './auth-results-parser'

const KEY_PREFIX = 'mf.authres:'

/**
 * Per-messageId cache of parsed Authentication-Results. Headers are
 * stamped at delivery time and never change, so the cache is good for
 * the life of the session. chrome.storage.session is cleared on
 * browser restart — fine, we just re-fetch.
 */
export async function getCachedAuth(
  messageId: string,
): Promise<AuthResults | null | undefined> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return undefined
  try {
    const key = KEY_PREFIX + messageId
    const stored = await chrome.storage.session.get(key)
    const v = stored[key] as AuthResults | null | undefined
    return v
  } catch {
    return undefined
  }
}

export async function setCachedAuth(
  messageId: string,
  results: AuthResults | null,
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return
  try {
    await chrome.storage.session.set({ [KEY_PREFIX + messageId]: results })
  } catch {
    /* ignore — best-effort */
  }
}
