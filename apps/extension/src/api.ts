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
