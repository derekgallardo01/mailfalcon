import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import {
  events,
  followUps,
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

const recipientInput = z.object({
  // SHA-256 hex of lowercased email — extension hashes client-side so
  // raw addresses never reach the server.
  hashedAddr: z.string().regex(/^[a-f0-9]{64}$/i),
  // "Display Name" or first part of the address. Used only to render
  // the dashboard ("Opened by Alice") — short and non-sensitive.
  displayLabel: z.string().max(80).optional(),
})

const mintSchema = z.object({
  recipientCount: z.number().int().min(0).max(500),
  links: z.array(z.string().url()).max(500).default([]),
  subject: z.string().max(500).optional(),
  // Optional per-recipient detail. When absent the email gets one
  // shared pixel (recipientId=null on every event) — keeps old
  // extension builds working.
  recipients: z.array(recipientInput).max(500).optional(),
  // If set, the worker inserts a follow_ups row that the cron
  // evaluator will fire as a reminder if no non-bot open by then.
  remindAfterDays: z.number().int().min(1).max(60).optional(),
  // Captured pre-send from InboxSDK if available. Stored so reply
  // detection can correlate inbound messages back to a tracked email.
  threadId: z.string().min(1).max(200).optional(),
  messageId: z.string().min(1).max(200).optional(),
})

const patchSchema = z.object({
  threadId: z.string().min(1).max(200).optional(),
  messageId: z.string().min(1).max(200).optional(),
})

const sortSchema = z.enum([
  'sentAt-desc',
  'sentAt-asc',
  'opens-desc',
  'clicks-desc',
])

const listQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().max(100).optional(),
  sort: sortSchema.default('sentAt-desc'),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
})

// SQLite's LIKE uses % and _ as wildcards. Escape them so user input is
// treated as a literal substring search.
function sqlLikeEscape(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

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
  const sentAt = Date.now()

  const recipientRows = (parsed.data.recipients ?? []).map((r) => ({
    id: `${id}:r${Math.random().toString(36).slice(2, 10)}`,
    emailId: id,
    hashedAddr: r.hashedAddr,
    displayLabel: r.displayLabel ?? null,
  }))

  const followupRow = parsed.data.remindAfterDays
    ? {
        id: `fu_${newTrackingId()}`,
        userId,
        emailId: id,
        remindAt: sentAt + parsed.data.remindAfterDays * 86_400_000,
        condition: 'no_open' as const,
        fired: 0,
      }
    : null

  await db.batch([
    db.insert(trackedEmails).values({
      id,
      userId,
      subjectHash: null,
      subject: parsed.data.subject ?? null,
      threadId: parsed.data.threadId ?? null,
      messageId: parsed.data.messageId ?? null,
      recipientCount: parsed.data.recipientCount,
      sentAt,
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
    ...recipientRows.map((r) => db.insert(recipients).values(r)),
    ...(followupRow ? [db.insert(followUps).values(followupRow)] : []),
  ])

  // For each recipient, sign `${id}:${recipientId}` so the per-recipient
  // pixel URLs can't be swapped by a forwarder without invalidating.
  const recipientPixels = await Promise.all(
    recipientRows.map(async (r) => ({
      recipientId: r.id,
      displayLabel: r.displayLabel,
      sig: await sign(`${id}:${r.id}`, secret, 12),
    })),
  )

  return c.json({
    id,
    sig,
    recipientPixels,
    usage: { used: usage.used, limit: usage.limit, tier },
  })
})

emailsRouter.get('/', async (c) => {
  const q = listQuerySchema.safeParse({
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
    q: c.req.query('q'),
    sort: c.req.query('sort'),
    from: c.req.query('from'),
    to: c.req.query('to'),
  })
  if (!q.success) return c.json({ error: 'invalid_query' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Aggregate expressions reused for both SELECT and ORDER BY.
  const opensExpr = sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`
  const clicksExpr = sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`

  const filters = [eq(trackedEmails.userId, userId)]
  // Cursor pagination only applies to the default sort (sentAt-desc).
  if (q.data.sort === 'sentAt-desc' && q.data.cursor) {
    filters.push(sql`${trackedEmails.sentAt} < ${q.data.cursor}`)
  }
  if (q.data.q && q.data.q.trim().length > 0) {
    filters.push(
      like(trackedEmails.subject, `%${sqlLikeEscape(q.data.q.trim())}%`),
    )
  }
  if (q.data.from !== undefined) {
    filters.push(gte(trackedEmails.sentAt, q.data.from))
  }
  if (q.data.to !== undefined) {
    filters.push(lte(trackedEmails.sentAt, q.data.to))
  }

  const orderBy = (() => {
    switch (q.data.sort) {
      case 'sentAt-asc':
        return asc(trackedEmails.sentAt)
      case 'opens-desc':
        return desc(opensExpr)
      case 'clicks-desc':
        return desc(clicksExpr)
      case 'sentAt-desc':
      default:
        return desc(trackedEmails.sentAt)
    }
  })()

  const rows = await db
    .select({
      id: trackedEmails.id,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      recipientCount: trackedEmails.recipientCount,
      privacyMode: trackedEmails.privacyMode,
      openCount: opensExpr,
      clickCount: clicksExpr,
      lastEventAt: sql<number | null>`MAX(${events.ts})`,
    })
    .from(trackedEmails)
    .leftJoin(events, eq(events.emailId, trackedEmails.id))
    .where(and(...filters))
    .groupBy(trackedEmails.id)
    .orderBy(orderBy)
    .limit(q.data.limit + 1)
    .all()

  const hasMore = rows.length > q.data.limit
  const page = hasMore ? rows.slice(0, q.data.limit) : rows
  // Cursor only makes sense for the default sort. Other sorts don't
  // tie-break cleanly so we don't expose a next-cursor for them.
  const nextCursor =
    q.data.sort === 'sentAt-desc' && hasMore
      ? page[page.length - 1]!.sentAt
      : null

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
      recipientId: e.recipientId,
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

/**
 * PATCH /v1/emails/:id — currently used by the extension to backfill
 * Gmail's threadID and messageID once Gmail confirms the send (the IDs
 * aren't known at presend time). Admin tier can patch any email; other
 * users only their own.
 */
emailsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const currentUser = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  const isAdmin = currentUser?.tier === 'admin'

  const updates: Record<string, unknown> = {}
  if (parsed.data.threadId !== undefined) updates.threadId = parsed.data.threadId
  if (parsed.data.messageId !== undefined)
    updates.messageId = parsed.data.messageId
  if (Object.keys(updates).length === 0) return c.json({ ok: true })

  const result = await db
    .update(trackedEmails)
    .set(updates)
    .where(
      isAdmin
        ? eq(trackedEmails.id, id)
        : and(eq(trackedEmails.id, id), eq(trackedEmails.userId, userId)),
    )
    .run()

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
