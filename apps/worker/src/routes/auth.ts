import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { getJwtSecret, signJwt, verifyJwt } from '../lib/jwt'
import { createLogger, errorMeta } from '../lib/logger'
import { sendCode } from '../lib/mailer'
import { rateLimit } from '../lib/rate-limit'

const requestSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
})

const verifySchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
})

type Bindings = {
  ENVIRONMENT: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
  DB: D1Database
  KV: KVNamespace
}

interface StoredCode {
  code: string
  attempts: number
  ts: number
}

function newSixDigitCode(): string {
  const buf = new Uint8Array(4)
  crypto.getRandomValues(buf)
  const num =
    (((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0) %
    900000
  return String(100000 + num)
}

export const authRouter = new Hono<{ Bindings: Bindings }>()

authRouter.post('/request', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400)
  const email = parsed.data.email

  // IP cap: 5 sign-in requests per 10 min from one IP. Stops mass abuse
  // before the per-email throttle even sees the request.
  const ip = getClientIp(c)
  const ipLimit = await rateLimit(c.env.KV, `auth-req-ip:${ip}`, 5, 600)
  if (!ipLimit.allowed) {
    createLogger({ env: c.env }).warn('auth_request_ip_throttle', { ip })
    return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '600' })
  }

  // Per-email throttle: 1 code per 60s. Silent so we don't tip off the
  // attacker whether the email exists.
  const rlKey = `code-rl:${email}`
  const inFlight = await c.env.KV.get(rlKey)
  if (inFlight) return c.json({ ok: true })
  await c.env.KV.put(rlKey, '1', { expirationTtl: 60 })

  const code = newSixDigitCode()
  const stored: StoredCode = { code, attempts: 0, ts: Date.now() }
  await c.env.KV.put(`code:${email}`, JSON.stringify(stored), {
    expirationTtl: 900,
  })

  try {
    await sendCode({ email, code, env: c.env })
  } catch (err) {
    createLogger({
      env: c.env,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    }).error('send_code_failed', { email, ...errorMeta(err) })
  }

  return c.json({ ok: true })
})

authRouter.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid' }, 400)
  const { email, code } = parsed.data

  const key = `code:${email}`
  const stored = (await c.env.KV.get(key, 'json')) as StoredCode | null
  if (!stored) return c.json({ error: 'expired_or_unknown' }, 400)

  if (stored.attempts >= 3) {
    await c.env.KV.delete(key)
    return c.json({ error: 'too_many_attempts' }, 429)
  }

  if (stored.code !== code) {
    await c.env.KV.put(
      key,
      JSON.stringify({ ...stored, attempts: stored.attempts + 1 }),
      { expirationTtl: 900 },
    )
    return c.json({ error: 'wrong_code' }, 401)
  }

  await c.env.KV.delete(key)

  const db = getDb(c.env.DB)
  let row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()

  if (!row) {
    const id = newTrackingId()
    await db
      .insert(users)
      .values({
        id,
        email,
        createdAt: Date.now(),
        tier: 'free',
      })
      .run()
    row = { id }
  }

  const secret = getJwtSecret(c.env)
  const jti = newTrackingId()
  await c.env.KV.put(
    `session:${jti}`,
    JSON.stringify({ userId: row.id, createdAt: Date.now() }),
    { expirationTtl: 30 * 24 * 3600 },
  )
  const token = await signJwt({ sub: row.id, jti }, secret)

  return c.json({ token, userId: row.id, email })
})

authRouter.post('/logout', async (c) => {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    const secret = getJwtSecret(c.env)
    const payload = await verifyJwt(token, secret)
    if (payload) {
      await c.env.KV.delete(`session:${payload.jti}`)
    }
  }
  return c.json({ ok: true })
})
