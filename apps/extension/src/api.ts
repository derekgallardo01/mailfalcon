import type { Session } from './auth-store'
import { getSession } from './auth-store'
import { config } from './config'

export interface RecipientInput {
  hashedAddr: string
  displayLabel?: string
}

export interface MintEmailRequest {
  recipientCount: number
  links: string[]
  subject?: string
  recipients?: RecipientInput[]
  remindAfterDays?: number
  threadId?: string
  messageId?: string
}

export interface RecipientPixel {
  recipientId: string
  displayLabel: string | null
  sig: string
  clickSig: string
}

export interface MintEmailResponse {
  id: string
  sig: string
  recipientPixels?: RecipientPixel[]
}

// Try direct chrome.storage first (popup + SW context), then fall back
// to messaging the SW. Content scripts called from inside InboxSDK
// callbacks sometimes can't see chrome.storage even though chrome.runtime
// works — the SW is always able to read storage and reply.
async function loadSession(): Promise<Session | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const direct = await getSession()
      if (direct) return direct
    } catch {
      /* fall through to messaging */
    }
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const resp = (await chrome.runtime.sendMessage({ type: 'get-session' })) as {
        session?: Session | null
      } | undefined
      return resp?.session ?? null
    } catch {
      return null
    }
  }
  return null
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await loadSession()
  return session ? { Authorization: `Bearer ${session.token}` } : {}
}

export async function mintEmail(req: MintEmailRequest): Promise<MintEmailResponse> {
  const res = await fetch(`${config.apiHost}/v1/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw new Error(`mint failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as MintEmailResponse
}

/**
 * Backfill Gmail's threadId + messageId once Gmail confirms the send.
 * Best-effort — failure here doesn't break tracking, just reply
 * detection won't find the row.
 */
export async function patchEmailIds(
  id: string,
  patch: { threadId?: string; messageId?: string },
): Promise<void> {
  const res = await fetch(
    `${config.apiHost}/v1/emails/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(patch),
    },
  )
  if (!res.ok) {
    throw new Error(`patch failed: ${res.status}`)
  }
}

export interface TrackingSummary {
  id: string
  humanOpens: number
  clicks: number
  replies: number
}

/**
 * Batch lookup of tracking summaries by Gmail thread ID. Used by the
 * Sent-folder indicator to decorate each row with an open / click chip.
 * Caller is responsible for batching (the server caps at 50/request).
 */
export async function lookupTrackingByThreads(
  threadIds: string[],
): Promise<Record<string, TrackingSummary>> {
  if (threadIds.length === 0) return {}
  const res = await fetch(`${config.apiHost}/v1/emails/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ threadIds }),
  })
  if (!res.ok) throw new Error(`lookup failed: ${res.status}`)
  const data = (await res.json()) as { tracking: Record<string, TrackingSummary> }
  return data.tracking ?? {}
}

/**
 * Set the per-email notification mute state. Called from the SW when
 * the user clicks "Mute this email" on a notification button.
 */
export async function muteEmail(id: string, muted: boolean): Promise<void> {
  const res = await fetch(
    `${config.apiHost}/v1/emails/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ notificationsMuted: muted }),
    },
  )
  if (!res.ok) {
    throw new Error(`mute failed: ${res.status}`)
  }
}

/**
 * Fire-and-forget — the extension calls this when InboxSDK reports a
 * new inbound message in a thread we've tracked. Server dedupes via
 * gmailMessageId so multiple Gmail tabs don't double-record.
 */
export async function reportReply(
  threadId: string,
  gmailMessageId: string,
): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ threadId, gmailMessageId }),
  })
  if (!res.ok) {
    throw new Error(`reply report failed: ${res.status}`)
  }
}

const TRACKED_THREADS_KEY = 'mf.trackedThreads'
const TRACKED_THREAD_DOMAINS_KEY = 'mf.trackedThreadDomains'
const MAX_TRACKED_THREADS = 500

/**
 * Append a Gmail thread ID to the local "tracked threads" set so the
 * content script knows to fire reply events for inbound messages on it.
 * Optionally store the original recipient domain so the spoof detector
 * can flag replies that arrive from a different domain than the thread
 * was started with.
 */
export async function rememberTrackedThread(
  threadId: string,
  originalRecipientDomain?: string,
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  try {
    const stored = await chrome.storage.local.get([
      TRACKED_THREADS_KEY,
      TRACKED_THREAD_DOMAINS_KEY,
    ])
    const list = (stored[TRACKED_THREADS_KEY] as string[] | undefined) ?? []
    const domainsRaw = stored[TRACKED_THREAD_DOMAINS_KEY] as
      | Record<string, string>
      | undefined
    const domains = { ...(domainsRaw ?? {}) }
    const nextList = list.includes(threadId)
      ? list
      : [...list, threadId].slice(-MAX_TRACKED_THREADS)

    if (originalRecipientDomain && originalRecipientDomain.length > 0) {
      domains[threadId] = originalRecipientDomain.toLowerCase()
    }
    // Drop domain entries for thread IDs no longer in the rolling set.
    const liveSet = new Set(nextList)
    for (const k of Object.keys(domains)) {
      if (!liveSet.has(k)) delete domains[k]
    }

    await chrome.storage.local.set({
      [TRACKED_THREADS_KEY]: nextList,
      [TRACKED_THREAD_DOMAINS_KEY]: domains,
    })
  } catch {
    /* ignore */
  }
}

export async function isTrackedThread(threadId: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return false
  try {
    const stored = await chrome.storage.local.get(TRACKED_THREADS_KEY)
    const list = (stored[TRACKED_THREADS_KEY] as string[] | undefined) ?? []
    return list.includes(threadId)
  } catch {
    return false
  }
}

/**
 * Return the original recipient domain we recorded when the user sent
 * the email that started this tracked thread, or null if unknown
 * (untracked thread, or sent by an older extension build).
 */
export async function getTrackedThreadDomain(threadId: string): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
  try {
    const stored = await chrome.storage.local.get(TRACKED_THREAD_DOMAINS_KEY)
    const domains = stored[TRACKED_THREAD_DOMAINS_KEY] as
      | Record<string, string>
      | undefined
    return domains?.[threadId] ?? null
  } catch {
    return null
  }
}

export async function clearTrackedThreads(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local
    .remove([TRACKED_THREADS_KEY, TRACKED_THREAD_DOMAINS_KEY])
    .catch(() => undefined)
}

export async function requestCode(email: string): Promise<void> {
  const res = await fetch(`${config.apiHost}/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`request code failed: ${res.status}`)
}

export interface VerifyResponse {
  token: string
  userId: string
  email: string
}

export async function verifyCode(email: string, code: string): Promise<VerifyResponse> {
  const res = await fetch(`${config.apiHost}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string }
    throw new Error(body.error ?? `verify failed: ${res.status}`)
  }
  return (await res.json()) as VerifyResponse
}

export async function logout(): Promise<void> {
  await fetch(`${config.apiHost}/auth/logout`, {
    method: 'POST',
    headers: { ...(await authHeader()) },
  }).catch(() => undefined)
}

export interface Template {
  id: string
  name: string
  subject: string
  bodyHtml: string
  createdAt: number
}

const TEMPLATES_CACHE_KEY = 'mf.templatesCache'
const TEMPLATES_CACHE_TTL_MS = 60 * 60 * 1000

interface CachedTemplates {
  fetchedAt: number
  templates: Template[]
}

/**
 * Templates the user manages on the web. Cached in chrome.storage for an
 * hour so the popup is instant — refetched in the background after the
 * TTL expires.
 */
export async function listTemplates(opts?: {
  force?: boolean
}): Promise<Template[]> {
  if (!opts?.force && typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(TEMPLATES_CACHE_KEY)
      const cache = stored[TEMPLATES_CACHE_KEY] as CachedTemplates | undefined
      if (cache && Date.now() - cache.fetchedAt < TEMPLATES_CACHE_TTL_MS) {
        return cache.templates
      }
    } catch {
      /* fall through to network */
    }
  }

  const res = await fetch(`${config.apiHost}/v1/templates`, {
    headers: { ...(await authHeader()) },
  })
  if (!res.ok) throw new Error(`templates_list_failed:${res.status}`)
  const data = (await res.json()) as { templates: Template[] }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({
        [TEMPLATES_CACHE_KEY]: {
          fetchedAt: Date.now(),
          templates: data.templates,
        } satisfies CachedTemplates,
      })
    } catch {
      /* ignore cache write failure */
    }
  }
  return data.templates
}

export async function clearTemplatesCache(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local.remove(TEMPLATES_CACHE_KEY).catch(() => undefined)
}
