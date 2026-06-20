import { type AuthResults, parseAuthResults } from './auth-results-parser'
import { getCachedAuth, setCachedAuth } from './verification-cache'
import { getValidAccessToken } from './google-oauth'

interface GmailMessageMetadata {
  payload?: {
    headers?: Array<{ name: string; value: string }>
  }
}

/**
 * Fetch Authentication-Results for a given Gmail messageId. Cached per
 * messageId (Authentication-Results is immutable for a message).
 *
 * Returns:
 *   - AuthResults on success (always with authority === 'mx.google.com')
 *   - null if the message has no Gmail-stamped Authentication-Results
 *     header (e.g. non-Gmail-routed mail in a custom inbox)
 *   - undefined if the call failed for an operational reason (token
 *     missing, network error, 401) — caller should fall back to
 *     heuristics + may prompt for reconnect
 */
export async function fetchAuthResults(
  messageId: string,
): Promise<AuthResults | null | undefined> {
  // Cache hit (including a cached null — "we already checked, no
  // Gmail-authoritative header").
  const cached = await getCachedAuth(messageId)
  if (cached !== undefined) return cached

  const token = await getValidAccessToken()
  if (!token) return undefined

  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}` +
    '?format=metadata' +
    '&metadataHeaders=Authentication-Results' +
    '&metadataHeaders=From' +
    '&metadataHeaders=Reply-To'

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    return undefined
  }
  if (res.status === 401) return undefined
  if (!res.ok) return undefined
  const data = (await res.json().catch(() => null)) as GmailMessageMetadata | null
  if (!data?.payload?.headers) {
    await setCachedAuth(messageId, null)
    return null
  }

  // Gmail can stamp multiple Authentication-Results entries (relay
  // chains). The mx.google.com one is the authoritative read; others
  // are upstream relays. We try every header until one parses to
  // mx.google.com authority.
  let parsed: AuthResults | null = null
  for (const h of data.payload.headers) {
    if (h.name.toLowerCase() !== 'authentication-results') continue
    const p = parseAuthResults(h.value)
    if (p) {
      parsed = p
      break
    }
  }

  await setCachedAuth(messageId, parsed)
  return parsed
}
