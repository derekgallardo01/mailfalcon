import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  events,
  links,
  recipients,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import { newSalt, newTrackingId, sign } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getHmacSecret } from '../lib/secrets'
import { checkAndIncrementUsage } from '../lib/usage'

const mintSchema = z.object({
  recipientCount: z.number().int().min(0).max(500),
  links: z.array(z.string().url()).max(500).default([]),
  subject: z.string().max(500).optional(),
})

const listQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
  KV: KVNamespace
}

export const emailsRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

emailsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = mintSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const user = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  const tier = user?.tier ?? 'free'

  const usage = await checkAndIncrementUsage(c.env.KV, userId, tier)
  if (!usage.allowed) {
    return c.json(
      {
        error: 'free_tier_cap_reached',
        used: usage.used,
        limit: usage.limit,
        message: `Free plan allows ${usage.limit} tracked emails per day. Upgrade to Pro for unlimited.`,
      },
      429,
    )
  }

  const secret = getHmacSecret(c.env)
  const id = newTrackingId()
  const hmacSalt = newSalt()
  const sig = await sign(id, secret, 12)

  await db.batch([
    db.insert(trackedEmails).values({
      id,
      userId,
      subjectHash: null,
      subject: parsed.data.subject ?? null,
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

  return c.json({
    id,
    sig,
    usage: { used: usage.used, limit: usage.limit, tier },
  })
})

emailsRouter.get('/', async (c) => {
  const q = listQuerySchema.safeParse({
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
  })
  if (!q.success) return c.json({ error: 'invalid_query' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: trackedEmails.id,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      recipientCount: trackedEmails.recipientCount,
      privacyMode: trackedEmails.privacyMode,
      openCount: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`,
      clickCount: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      lastEventAt: sql<number | null>`MAX(${events.ts})`,
    })
    .from(trackedEmails)
    .leftJoin(events, eq(events.emailId, trackedEmails.id))
    .where(
      q.data.cursor
        ? and(
            eq(trackedEmails.userId, userId),
            sql`${trackedEmails.sentAt} < ${q.data.cursor}`,
          )
        : eq(trackedEmails.userId, userId),
    )
    .groupBy(trackedEmails.id)
    .orderBy(desc(trackedEmails.sentAt))
    .limit(q.data.limit + 1)
    .all()

  const hasMore = rows.length > q.data.limit
  const page = hasMore ? rows.slice(0, q.data.limit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.sentAt : null

  return c.json({
    emails: page.map((r) => ({
      id: r.id,
      subject: r.subject,
      sentAt: r.sentAt,
      recipientCount: r.recipientCount,
      privacyMode: r.privacyMode === 1,
      openCount: Number(r.openCount),
      clickCount: Number(r.clickCount),
      lastEventAt: r.lastEventAt,
    })),
    nextCursor,
  })
})

emailsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const currentUser = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  const isAdmin = currentUser?.tier === 'admin'

  // Admins can view any email; regular users only their own.
  const email = await db
    .select()
    .from(trackedEmails)
    .where(
      isAdmin
        ? eq(trackedEmails.id, id)
        : and(eq(trackedEmails.id, id), eq(trackedEmails.userId, userId)),
    )
    .get()
  if (!email) return c.json({ error: 'not_found' }, 404)

  const [eventRows, linkRows, recipientRows, counters] = await Promise.all([
    db
      .select()
      .from(events)
      .where(eq(events.emailId, id))
      .orderBy(desc(events.ts))
      .limit(500)
      .all(),
    db
      .select()
      .from(links)
      .where(eq(links.emailId, id))
      .orderBy(links.idx)
      .all(),
    db
      .select()
      .from(recipients)
      .where(eq(recipients.emailId, id))
      .all(),
    db
      .select({
        opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`,
        clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
        humanOpens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
      })
      .from(events)
      .where(eq(events.emailId, id))
      .get(),
  ])

  return c.json({
    email: {
      id: email.id,
      subject: email.subject,
      sentAt: email.sentAt,
      recipientCount: email.recipientCount,
      privacyMode: email.privacyMode === 1,
      threadId: email.threadId,
    },
    counts: {
      opens: Number(counters?.opens ?? 0),
      clicks: Number(counters?.clicks ?? 0),
      humanOpens: Number(counters?.humanOpens ?? 0),
    },
    links: linkRows.map((l) => ({
      idx: l.idx,
      originalUrl: l.originalUrl,
    })),
    recipients: recipientRows.map((r) => ({
      id: r.id,
      displayLabel: r.displayLabel,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      type: e.type,
      ts: e.ts,
      linkId: e.linkId,
      uaClass: e.uaClass,
      ipPrefix: e.ipPrefix,
      ipFull: e.ipFull,
      country: e.country,
      region: e.region,
      regionCode: e.regionCode,
      city: e.city,
      postalCode: e.postalCode,
      latitude: e.latitude,
      longitude: e.longitude,
      timezone: e.timezone,
      browserName: e.browserName,
      browserVersion: e.browserVersion,
      osName: e.osName,
      osVersion: e.osVersion,
      deviceType: e.deviceType,
      deviceVendor: e.deviceVendor,
      deviceModel: e.deviceModel,
      isFirstOpen: e.isFirstOpen === 1,
    })),
  })
})
