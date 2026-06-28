import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { events, trackedEmails } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { createLogger, errorMeta } from '../lib/logger'
import { fanoutPush } from '../lib/push-fanout'
import { rateLimit } from '../lib/rate-limit'

const reportSchema = z.object({
  threadId: z.string().min(1).max(200),
  gmailMessageId: z.string().min(1).max(200),
})

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  KV: KVNamespace
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export const repliesRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * POST /v1/replies — extension calls this when InboxSDK reports a new
 * inbound message in a tracked thread. Idempotent via a KV nonce keyed
 * by `gmailMessageId` so multiple Gmail tabs don't double-record.
 */
repliesRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const ip = getClientIp(c)
  const ipLimit = await rateLimit(c.env.KV, `replies:${ip}`, 60, 60)
  if (!ipLimit.allowed) {
    return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' })
  }

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const nonceKey = `reply-seen:${userId}:${parsed.data.gmailMessageId}`
  if (await c.env.KV.get(nonceKey)) {
    return c.json({ ok: true, deduped: true })
  }

  // Match the thread to one of the user's tracked emails. If multiple
  // tracked emails share a threadId (which can happen if the user
  // mailed twice in the same thread), pick the most recent.
  const email = await db
    .select({
      id: trackedEmails.id,
      userId: trackedEmails.userId,
      subject: trackedEmails.subject,
      notificationsMuted: trackedEmails.notificationsMuted,
    })
    .from(trackedEmails)
    .where(
      and(
        eq(trackedEmails.threadId, parsed.data.threadId),
        eq(trackedEmails.userId, userId),
      ),
    )
    .orderBy(trackedEmails.sentAt)
    .all()
  if (email.length === 0) return c.json({ error: 'no_tracked_thread' }, 404)
  const target = email[email.length - 1]!
  const muted = target.notificationsMuted === 1

  await db
    .insert(events)
    .values({
      emailId: target.id,
      recipientId: null,
      type: 'reply',
      linkId: null,
      ts: Date.now(),
      uaClass: 'unknown',
      ipPrefix: null,
      ipFull: null,
      country: null,
      region: null,
      regionCode: null,
      city: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      timezone: null,
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null,
      deviceType: null,
      deviceVendor: null,
      deviceModel: null,
      isFirstOpen: 0,
    })
    .run()

  c.executionCtx.waitUntil(
    c.env.KV.put(nonceKey, '1', { expirationTtl: 86_400 }),
  )

  if (!muted) {
    c.executionCtx.waitUntil(
      fanoutPush(db, c.env, target.userId, {
        kind: 'reply',
        subject: target.subject,
        emailId: target.id,
        text: 'New reply in tracked thread',
      }).catch((err) =>
        createLogger({ env: c.env }).warn('reply_fanout_failed', errorMeta(err)),
      ),
    )
  }

  return c.json({ ok: true, emailId: target.id })
})
