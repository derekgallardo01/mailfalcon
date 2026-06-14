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

export interface EmailDetail {
  email: {
    id: string
    sentAt: number
    recipientCount: number
    privacyMode: boolean
    threadId: string | null
  }
  counts: { opens: number; clicks: number; humanOpens: number }
  links: { idx: number; originalUrl: string }[]
  recipients: { id: string; displayLabel: string | null }[]
  events: {
    id: number
    type: 'open' | 'click'
    ts: number
    linkId: string | null
    uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
    country: string | null
    isFirstOpen: boolean
  }[]
}

export async function getEmailDetail(id: string): Promise<EmailDetail> {
  const res = await fetch(`${config.apiHost}/v1/emails/${encodeURIComponent(id)}`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 404) throw new Error('not_found')
  if (!res.ok) throw new Error(`detail_failed:${res.status}`)
  return (await res.json()) as EmailDetail
}

export interface MeResponse {
  id: string
  email: string
  tier: 'free' | 'pro' | 'team' | 'admin'
  createdAt: number
  hasStripeCustomer: boolean
  usage: { used: number; limit: number }
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetch(`${config.apiHost}/v1/me`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`me_failed:${res.status}`)
  return (await res.json()) as MeResponse
}

export async function startCheckout(): Promise<string> {
  const res = await fetch(`${config.apiHost}/v1/billing/checkout`, {
    method: 'POST',
    headers: { ...authHeader() },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `checkout_failed:${res.status}`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

export async function openBillingPortal(): Promise<string> {
  const res = await fetch(`${config.apiHost}/v1/billing/portal`, {
    method: 'POST',
    headers: { ...authHeader() },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `portal_failed:${res.status}`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiHost}/v1/admin${path}`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`admin_failed:${res.status}`)
  return (await res.json()) as T
}

export interface AdminStats {
  totals: { users: number; emails: number; events: number }
  usersByTier: Record<string, number>
  today: { newUsers: number; emailsSent: number; eventsLogged: number }
}

export interface AdminUser {
  id: string
  email: string
  tier: 'free' | 'pro' | 'team' | 'admin'
  createdAt: number
  emailCount: number
  lastEmailAt: number | null
}

export interface AdminEmail {
  id: string
  userId: string
  userEmail: string
  sentAt: number
  recipientCount: number
  privacyMode: boolean
  opens: number
  clicks: number
}

export interface AdminEvent {
  id: number
  emailId: string
  type: 'open' | 'click'
  linkId: string | null
  ts: number
  uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
  country: string | null
  isFirstOpen: boolean
  userId: string
  userEmail: string
}

export const admin = {
  stats: () => adminGet<AdminStats>('/stats'),
  users: () => adminGet<{ users: AdminUser[]; nextCursor: number | null }>('/users'),
  emails: () => adminGet<{ emails: AdminEmail[] }>('/emails'),
  events: () => adminGet<{ events: AdminEvent[] }>('/events'),
}
