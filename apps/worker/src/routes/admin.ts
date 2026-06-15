import { Hono } from 'hono'
import { desc, eq, gt, sql } from 'drizzle-orm'
import {
  events,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const adminRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

function todayStart(): number {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

adminRouter.get('/stats', async (c) => {
  const db = getDb(c.env.DB)
  const start = todayStart()

  const [totals, byTier, today] = await Promise.all([
    db
      .select({
        users: sql<number>`COUNT(DISTINCT ${users.id})`,
        emails: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails})`,
        events: sql<number>`(SELECT COUNT(*) FROM ${events})`,
      })
      .from(users)
      .get(),
    db
      .select({
        tier: users.tier,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .groupBy(users.tier)
      .all(),
    db
      .select({
        newUsers: sql<number>`(SELECT COUNT(*) FROM ${users} WHERE ${users.createdAt} >= ${start})`,
        emailsSent: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails} WHERE ${trackedEmails.sentAt} >= ${start})`,
        eventsLogged: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.ts} >= ${start})`,
      })
      .from(users)
      .limit(1)
      .get(),
  ])

  const tierMap: Record<string, number> = {
    free: 0,
    pro: 0,
    team: 0,
    admin: 0,
  }
  for (const row of byTier) tierMap[row.tier] = Number(row.count)

  return c.json({
    totals: {
      users: Number(totals?.users ?? 0),
      emails: Number(totals?.emails ?? 0),
      events: Number(totals?.events ?? 0),
    },
    usersByTier: tierMap,
    today: {
      newUsers: Number(today?.newUsers ?? 0),
      emailsSent: Number(today?.emailsSent ?? 0),
      eventsLogged: Number(today?.eventsLogged ?? 0),
    },
  })
})

adminRouter.get('/users', async (c) => {
  const cursor = Number(c.req.query('cursor') ?? '')
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      createdAt: users.createdAt,
      emailCount: sql<number>`COALESCE(COUNT(DISTINCT ${trackedEmails.id}), 0)`,
      lastEmailAt: sql<number | null>`MAX(${trackedEmails.sentAt})`,
    })
    .from(users)
    .leftJoin(trackedEmails, eq(trackedEmails.userId, users.id))
    .where(Number.isFinite(cursor) && cursor > 0 ? gt(users.createdAt, 0) : undefined)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(limit + 1)
    .all()

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt : null

  return c.json({
    users: page.map((r) => ({
      id: r.id,
      email: r.email,
      tier: r.tier,
      createdAt: r.createdAt,
      emailCount: Number(r.emailCount),
      lastEmailAt: r.lastEmailAt,
    })),
    nextCursor,
  })
})

adminRouter.get('/emails', async (c) => {
  const userFilter = c.req.query('userId')
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 200)
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: trackedEmails.id,
      userId: trackedEmails.userId,
      userEmail: users.email,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      recipientCount: trackedEmails.recipientCount,
      privacyMode: trackedEmails.privacyMode,
      opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`,
      clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
    })
    .from(trackedEmails)
    .innerJoin(users, eq(users.id, trackedEmails.userId))
    .leftJoin(events, eq(events.emailId, trackedEmails.id))
    .where(userFilter ? eq(trackedEmails.userId, userFilter) : undefined)
    .groupBy(trackedEmails.id)
    .orderBy(desc(trackedEmails.sentAt))
    .limit(limit)
    .all()

  return c.json({
    emails: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      subject: r.subject,
      sentAt: r.sentAt,
      recipientCount: r.recipientCount,
      privacyMode: r.privacyMode === 1,
      opens: Number(r.opens),
      clicks: Number(r.clicks),
    })),
  })
})

adminRouter.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const user = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      createdAt: users.createdAt,
      stripeCustId: users.stripeCustId,
    })
    .from(users)
    .where(eq(users.id, id))
    .get()
  if (!user) return c.json({ error: 'not_found' }, 404)

  const [emailsList, eventsList, totals] = await Promise.all([
    db
      .select({
        id: trackedEmails.id,
        subject: trackedEmails.subject,
        sentAt: trackedEmails.sentAt,
        recipientCount: trackedEmails.recipientCount,
        privacyMode: trackedEmails.privacyMode,
        opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`,
        clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
        lastEventAt: sql<number | null>`MAX(${events.ts})`,
      })
      .from(trackedEmails)
      .leftJoin(events, eq(events.emailId, trackedEmails.id))
      .where(eq(trackedEmails.userId, id))
      .groupBy(trackedEmails.id)
      .orderBy(desc(trackedEmails.sentAt))
      .limit(100)
      .all(),
    db
      .select({
        id: events.id,
        emailId: events.emailId,
        type: events.type,
        linkId: events.linkId,
        ts: events.ts,
        uaClass: events.uaClass,
        ipPrefix: events.ipPrefix,
        ipFull: events.ipFull,
        country: events.country,
        region: events.region,
        regionCode: events.regionCode,
        city: events.city,
        postalCode: events.postalCode,
        latitude: events.latitude,
        longitude: events.longitude,
        timezone: events.timezone,
        browserName: events.browserName,
        browserVersion: events.browserVersion,
        osName: events.osName,
        osVersion: events.osVersion,
        deviceType: events.deviceType,
        deviceVendor: events.deviceVendor,
        deviceModel: events.deviceModel,
        isFirstOpen: events.isFirstOpen,
      })
      .from(events)
      .innerJoin(trackedEmails, eq(trackedEmails.id, events.emailId))
      .where(eq(trackedEmails.userId, id))
      .orderBy(desc(events.ts))
      .limit(200)
      .all(),
    db
      .select({
        emails: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails} WHERE ${trackedEmails.userId} = ${id})`,
        opens: sql<number>`(SELECT COUNT(*) FROM ${events} e INNER JOIN ${trackedEmails} te ON te.id = e.email_id WHERE te.user_id = ${id} AND e.type = 'open')`,
        humanOpens: sql<number>`(SELECT COUNT(*) FROM ${events} e INNER JOIN ${trackedEmails} te ON te.id = e.email_id WHERE te.user_id = ${id} AND e.type = 'open' AND e.ua_class != 'bot')`,
        clicks: sql<number>`(SELECT COUNT(*) FROM ${events} e INNER JOIN ${trackedEmails} te ON te.id = e.email_id WHERE te.user_id = ${id} AND e.type = 'click')`,
      })
      .from(users)
      .where(eq(users.id, id))
      .get(),
  ])

  return c.json({
    user: {
      ...user,
      hasStripeCustomer: !!user.stripeCustId,
    },
    totals: {
      emails: Number(totals?.emails ?? 0),
      opens: Number(totals?.opens ?? 0),
      humanOpens: Number(totals?.humanOpens ?? 0),
      clicks: Number(totals?.clicks ?? 0),
    },
    emails: emailsList.map((r) => ({
      id: r.id,
      subject: r.subject,
      sentAt: r.sentAt,
      recipientCount: r.recipientCount,
      privacyMode: r.privacyMode === 1,
      opens: Number(r.opens),
      clicks: Number(r.clicks),
      lastEventAt: r.lastEventAt,
    })),
    events: eventsList.map((e) => ({
      ...e,
      isFirstOpen: e.isFirstOpen === 1,
    })),
  })
})

adminRouter.get('/events', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? '200'), 500)
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: events.id,
      emailId: events.emailId,
      type: events.type,
      linkId: events.linkId,
      ts: events.ts,
      uaClass: events.uaClass,
      ipPrefix: events.ipPrefix,
      ipFull: events.ipFull,
      country: events.country,
      region: events.region,
      regionCode: events.regionCode,
      city: events.city,
      postalCode: events.postalCode,
      latitude: events.latitude,
      longitude: events.longitude,
      timezone: events.timezone,
      browserName: events.browserName,
      browserVersion: events.browserVersion,
      osName: events.osName,
      osVersion: events.osVersion,
      deviceType: events.deviceType,
      deviceVendor: events.deviceVendor,
      deviceModel: events.deviceModel,
      isFirstOpen: events.isFirstOpen,
      userId: trackedEmails.userId,
      userEmail: users.email,
    })
    .from(events)
    .innerJoin(trackedEmails, eq(trackedEmails.id, events.emailId))
    .innerJoin(users, eq(users.id, trackedEmails.userId))
    .orderBy(desc(events.ts))
    .limit(limit)
    .all()

  return c.json({
    events: rows.map((r) => ({
      ...r,
      isFirstOpen: r.isFirstOpen === 1,
    })),
  })
})
