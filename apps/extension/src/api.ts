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
