import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { notificationSubscriptions } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { fanoutPush } from '../lib/push-fanout'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
  ua: z.string().max(500).optional(),
})

async function sha256B64Url(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  const arr = Array.from(new Uint8Array(buf))
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '').slice(0, 22)
}

export const pushRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

pushRouter.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const id = await sha256B64Url(parsed.data.endpoint)
  const now = Date.now()

  await db
    .insert(notificationSubscriptions)
    .values({
      id,
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      ua: parsed.data.ua ?? null,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: notificationSubscriptions.id,
      set: {
        userId,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        ua: parsed.data.ua ?? null,
        lastSeenAt: now,
      },
    })
    .run()

  return c.json({ ok: true, id })
})

pushRouter.delete('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const id = await sha256B64Url(parsed.data.endpoint)
  await db
    .delete(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.id, id),
        eq(notificationSubscriptions.userId, userId),
      ),
    )
    .run()
  return c.json({ ok: true })
})

pushRouter.post('/test', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const result = await fanoutPush(db, c.env, userId)
  return c.json(result)
})
