import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import { events, recipients, trackedEmails } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

function sqlLikeEscape(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

const sortSchema = z.enum([
  'lastSeen-desc',
  'sends-desc',
  'opens-desc',
  'replyRate-desc',
])

const listQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().max(100).optional(),
  sort: sortSchema.default('lastSeen-desc'),
})

export const contactsRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * GET /v1/contacts — list view aggregating engagement per unique
 * recipient (hashedAddr). "Sends" counts DISTINCT tracked_emails the
 * hash appears in, so a single send to 5 To: addresses counts as 1 send
 * for each of those 5 recipients (not 5).
 */
contactsRouter.get('/', async (c) => {
  const q = listQuerySchema.safeParse({
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
    q: c.req.query('q'),
    sort: c.req.query('sort'),
  })
  if (!q.success) return c.json({ error: 'invalid_query' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Build the per-contact aggregate. The triple-join (tracked_emails →
  // recipients → events left-join) lets a hash with sends but zero
  // events still appear in results.
  const sendsExpr = sql<number>`COUNT(DISTINCT ${trackedEmails.id})`
  const humanOpensExpr = sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`
  const clicksExpr = sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`
  const repliesExpr = sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'reply' THEN 1 ELSE 0 END), 0)`
  const lastEventAtExpr = sql<number | null>`MAX(${events.ts})`
  const firstSeenAtExpr = sql<number>`MIN(${trackedEmails.sentAt})`
  // Most recent non-null displayLabel for this hash — picks the label
  // from the latest send. Note: subquery would be cleaner, but D1's
  // SQLite supports this aggregate form too.
  const displayLabelExpr = sql<string | null>`(
    SELECT r.display_label FROM recipients r
    INNER JOIN tracked_emails t ON t.id = r.email_id
    WHERE r.hashed_addr = ${recipients.hashedAddr}
      AND t.user_id = ${userId}
      AND r.display_label IS NOT NULL
    ORDER BY t.sent_at DESC LIMIT 1
  )`

  const filters = [eq(trackedEmails.userId, userId)]
  if (q.data.q && q.data.q.trim().length > 0) {
    const pattern = `%${sqlLikeEscape(q.data.q.trim())}%`
    filters.push(like(recipients.displayLabel, pattern))
  }

  const orderBy = (() => {
    switch (q.data.sort) {
      case 'sends-desc':
        return desc(sendsExpr)
      case 'opens-desc':
        return desc(humanOpensExpr)
      case 'replyRate-desc':
        // replies / sends — divide-by-zero guarded by sends >= 1
        return desc(sql`CAST(${repliesExpr} AS REAL) / ${sendsExpr}`)
      case 'lastSeen-desc':
      default:
        return desc(lastEventAtExpr)
    }
  })()

  // Cursor pagination on the default sort only. Cursor = the previous
  // page's last `lastEventAt`; we want rows with strictly older
  // lastEventAt.
  if (q.data.sort === 'lastSeen-desc' && q.data.cursor) {
    // HAVING because lastEventAt is an aggregate.
    // We append this below using groupBy().having().
  }

  let query = db
    .select({
      hashedAddr: recipients.hashedAddr,
      displayLabel: displayLabelExpr,
      sends: sendsExpr,
      humanOpens: humanOpensExpr,
      clicks: clicksExpr,
      replies: repliesExpr,
      lastEventAt: lastEventAtExpr,
      firstSeenAt: firstSeenAtExpr,
    })
    .from(trackedEmails)
    .innerJoin(recipients, eq(recipients.emailId, trackedEmails.id))
    .leftJoin(events, eq(events.recipientId, recipients.id))
    .where(and(...filters))
    .groupBy(recipients.hashedAddr)
    .$dynamic()

  if (q.data.sort === 'lastSeen-desc' && q.data.cursor) {
    query = query.having(sql`MAX(${events.ts}) < ${q.data.cursor}`)
  }

  const rows = await query
    .orderBy(orderBy)
    .limit(q.data.limit + 1)
    .all()

  const hasMore = rows.length > q.data.limit
  const page = hasMore ? rows.slice(0, q.data.limit) : rows
  const nextCursor =
    q.data.sort === 'lastSeen-desc' && hasMore
      ? page[page.length - 1]!.lastEventAt
      : null

  return c.json({
    contacts: page.map((r) => ({
      hashedAddr: r.hashedAddr,
      displayLabel: r.displayLabel,
      sends: Number(r.sends),
      humanOpens: Number(r.humanOpens),
      clicks: Number(r.clicks),
      replies: Number(r.replies),
      lastEventAt: r.lastEventAt,
      firstSeenAt: Number(r.firstSeenAt),
    })),
    nextCursor,
  })
})

/**
 * GET /v1/contacts/:hashedAddr — detail page.
 * Returns the same aggregate + the email + event history for this hash.
 */
contactsRouter.get('/:hashedAddr', async (c) => {
  const hashedAddr = c.req.param('hashedAddr')
  if (!/^[a-f0-9]{64}$/i.test(hashedAddr)) {
    return c.json({ error: 'invalid_hash' }, 400)
  }
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Aggregate
  const agg = await db
    .select({
      sends: sql<number>`COUNT(DISTINCT ${trackedEmails.id})`,
      humanOpens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
      clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      replies: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'reply' THEN 1 ELSE 0 END), 0)`,
      lastEventAt: sql<number | null>`MAX(${events.ts})`,
      firstSeenAt: sql<number | null>`MIN(${trackedEmails.sentAt})`,
      displayLabel: sql<string | null>`(
        SELECT r.display_label FROM recipients r
        INNER JOIN tracked_emails t ON t.id = r.email_id
        WHERE r.hashed_addr = ${hashedAddr}
          AND t.user_id = ${userId}
          AND r.display_label IS NOT NULL
        ORDER BY t.sent_at DESC LIMIT 1
      )`,
    })
    .from(trackedEmails)
    .innerJoin(recipients, eq(recipients.emailId, trackedEmails.id))
    .leftJoin(events, eq(events.recipientId, recipients.id))
    .where(
      and(
        eq(trackedEmails.userId, userId),
        eq(recipients.hashedAddr, hashedAddr),
      ),
    )
    .get()

  if (!agg || agg.firstSeenAt == null) {
    return c.json({ error: 'not_found' }, 404)
  }

  // Avg time to first open: for each email this contact appears in,
  // compute (firstOpenTs - sentAt), then average.
  const ttfo = await db
    .select({
      avg: sql<number | null>`
        AVG(CASE WHEN first_open_ts IS NOT NULL THEN first_open_ts - sent_at END)
      `,
    })
    .from(
      db
        .select({
          emailId: trackedEmails.id,
          sentAt: trackedEmails.sentAt,
          firstOpenTs: sql<number | null>`
            MIN(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN ${events.ts} END)
          `.as('first_open_ts'),
        })
        .from(trackedEmails)
        .innerJoin(recipients, eq(recipients.emailId, trackedEmails.id))
        .leftJoin(events, eq(events.recipientId, recipients.id))
        .where(
          and(
            eq(trackedEmails.userId, userId),
            eq(recipients.hashedAddr, hashedAddr),
          ),
        )
        .groupBy(trackedEmails.id)
        .as('per_email'),
    )
    .get()

  // Emails list: every tracked_emails this hash appears in, newest first.
  const emailRows = await db
    .select({
      id: trackedEmails.id,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      humanOpens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
      clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      hasReply: sql<number>`COALESCE(MAX(CASE WHEN ${events.type} = 'reply' THEN 1 ELSE 0 END), 0)`,
    })
    .from(trackedEmails)
    .innerJoin(recipients, eq(recipients.emailId, trackedEmails.id))
    .leftJoin(events, eq(events.recipientId, recipients.id))
    .where(
      and(
        eq(trackedEmails.userId, userId),
        eq(recipients.hashedAddr, hashedAddr),
      ),
    )
    .groupBy(trackedEmails.id)
    .orderBy(desc(trackedEmails.sentAt))
    .all()

  // Recent events for this contact — join via recipients to keep the
  // event-userId boundary intact.
  const eventRows = await db
    .select({
      id: events.id,
      type: events.type,
      ts: events.ts,
      emailId: events.emailId,
      subject: trackedEmails.subject,
      uaClass: events.uaClass,
      city: events.city,
      country: events.country,
      regionCode: events.regionCode,
    })
    .from(events)
    .innerJoin(recipients, eq(recipients.id, events.recipientId))
    .innerJoin(trackedEmails, eq(trackedEmails.id, events.emailId))
    .where(
      and(
        eq(trackedEmails.userId, userId),
        eq(recipients.hashedAddr, hashedAddr),
      ),
    )
    .orderBy(desc(events.ts))
    .limit(100)
    .all()

  return c.json({
    contact: {
      hashedAddr,
      displayLabel: agg.displayLabel,
      sends: Number(agg.sends),
      humanOpens: Number(agg.humanOpens),
      clicks: Number(agg.clicks),
      replies: Number(agg.replies),
      lastEventAt: agg.lastEventAt,
      firstSeenAt: Number(agg.firstSeenAt),
      avgTimeToFirstOpenMs: ttfo?.avg != null ? Number(ttfo.avg) : null,
    },
    emails: emailRows.map((r) => ({
      id: r.id,
      subject: r.subject,
      sentAt: r.sentAt,
      humanOpens: Number(r.humanOpens),
      clicks: Number(r.clicks),
      hasReply: Number(r.hasReply) === 1,
    })),
    events: eventRows.map((e) => ({
      type: e.type,
      ts: e.ts,
      emailId: e.emailId,
      subject: e.subject,
      uaClass: e.uaClass,
      city: e.city,
      country: e.country,
      regionCode: e.regionCode,
    })),
  })
})
