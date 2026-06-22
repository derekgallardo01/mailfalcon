import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { sessions, users, verifyCodes } from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { getJwtSecret, signJwt, verifyJwt } from '../lib/jwt'
import { createLogger, errorMeta } from '../lib/logger'
import { sendCode } from '../lib/mailer'
import { rateLimit } from '../lib/rate-limit'
import { ensurePersonalWorkspace } from '../lib/workspace'

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

  // Per-email throttle (60s) and code storage both live in D1 now.
  // KV's free-tier daily put cap was killing /auth/request; D1 has no
  // such cap, and the row count here is tiny (one row per pending
  // sign-in, max).
  const db = getDb(c.env.DB)
  const now = Date.now()
  const existing = await db
    .select()
    .from(verifyCodes)
    .where(eq(verifyCodes.email, email))
    .get()

  if (existing && existing.cooldownUntil > now) {
    // Silently noop so we don't tip off whether the email exists.
    return c.json({ ok: true })
  }

  const code = newSixDigitCode()
  const expiresAt = now + 15 * 60 * 1000
  const cooldownUntil = now + 60 * 1000
  await db
    .insert(verifyCodes)
    .values({
      email,
      code,
      attempts: 0,
      cooldownUntil,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: verifyCodes.email,
      set: { code, attempts: 0, cooldownUntil, expiresAt },
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

  const db = getDb(c.env.DB)
  const stored = await db
    .select()
    .from(verifyCodes)
    .where(eq(verifyCodes.email, email))
    .get()

  if (!stored || stored.expiresAt < Date.now()) {
    if (stored) {
      await db.delete(verifyCodes).where(eq(verifyCodes.email, email)).run()
    }
    return c.json({ error: 'expired_or_unknown' }, 400)
  }

  if (stored.attempts >= 3) {
    await db.delete(verifyCodes).where(eq(verifyCodes.email, email)).run()
    return c.json({ error: 'too_many_attempts' }, 429)
  }

  if (stored.code !== code) {
    await db
      .update(verifyCodes)
      .set({ attempts: stored.attempts + 1 })
      .where(eq(verifyCodes.email, email))
      .run()
    return c.json({ error: 'wrong_code' }, 401)
  }

  await db.delete(verifyCodes).where(eq(verifyCodes.email, email)).run()

  let row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()

  if (!row) {
    const id = newTrackingId()
    const createdAt = Date.now()
    await db
      .insert(users)
      .values({
        id,
        email,
        createdAt,
        tier: 'free',
      })
      .run()
    // Bootstrap a personal workspace + owner membership so every
    // request from this user always has a valid active workspace.
    await ensurePersonalWorkspace(db, id, createdAt)
    row = { id }
  }

  const secret = getJwtSecret(c.env)
  const jti = newTrackingId()
  const createdAt = Date.now()
  const expiresAt = createdAt + 30 * 24 * 3600 * 1000
  await db
    .insert(sessions)
    .values({ jti, userId: row.id, createdAt, expiresAt })
    .run()
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
      const db = getDb(c.env.DB)
      await db.delete(sessions).where(eq(sessions.jti, payload.jti)).run()
    }
  }
  return c.json({ ok: true })
})
