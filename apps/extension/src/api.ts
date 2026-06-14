import { getSession } from './auth-store'
import { config } from './config'

export interface MintEmailRequest {
  recipientCount: number
  links: string[]
}

export interface MintEmailResponse {
  id: string
  sig: string
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await getSession()
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
