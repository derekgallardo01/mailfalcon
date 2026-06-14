import { config } from './config'
import { getSession } from './auth-store'

function authHeader(): Record<string, string> {
  const s = getSession()
  return s ? { Authorization: `Bearer ${s.token}` } : {}
}

export async function requestCode(email: string): Promise<void> {
  const res = await fetch(`${config.apiHost}/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`request_failed:${res.status}`)
}

export interface VerifyResponse {
  token: string
  userId: string
  email: string
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<VerifyResponse> {
  const res = await fetch(`${config.apiHost}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `verify_failed:${res.status}`)
  }
  return (await res.json()) as VerifyResponse
}

export async function logout(): Promise<void> {
  await fetch(`${config.apiHost}/auth/logout`, {
    method: 'POST',
    headers: { ...authHeader() },
  }).catch(() => undefined)
}

export interface EmailListItem {
  id: string
  sentAt: number
  recipientCount: number
  privacyMode: boolean
  openCount: number
  clickCount: number
  lastEventAt: number | null
}

export interface EmailListResponse {
  emails: EmailListItem[]
  nextCursor: number | null
}

export async function listEmails(cursor?: number): Promise<EmailListResponse> {
  const url = new URL(`${config.apiHost}/v1/emails`)
  if (cursor) url.searchParams.set('cursor', String(cursor))
  const res = await fetch(url, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`list_failed:${res.status}`)
  return (await res.json()) as EmailListResponse
}
