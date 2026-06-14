import { Hono } from 'hono'
import { z } from 'zod'
import { links, trackedEmails } from '@mailfalcon/db/schema'
import { newSalt, newTrackingId, sign } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getHmacSecret } from '../lib/secrets'

const requestSchema = z.object({
  recipientCount: z.number().int().min(0).max(500),
  links: z.array(z.string().url()).max(500).default([]),
})

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
}

export const emailsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()

emailsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const userId = c.get('userId')
  const secret = getHmacSecret(c.env)
  const db = getDb(c.env.DB)

  const id = newTrackingId()
  const hmacSalt = newSalt()
  const sig = await sign(id, secret, 12)

  await db.batch([
    db.insert(trackedEmails).values({
      id,
      userId,
      subjectHash: null,
      threadId: null,
      messageId: null,
      recipientCount: parsed.data.recipientCount,
      sentAt: Date.now(),
      hmacSalt,
      privacyMode: 0,
    }),
    ...parsed.data.links.map((url, idx) =>
      db.insert(links).values({
        id: `${id}:${idx}`,
        emailId: id,
        idx,
        originalUrl: url,
      }),
    ),
  ])

  // TODO(freemium): increment usage_counters, 429 if over cap
  return c.json({ id, sig })
})
