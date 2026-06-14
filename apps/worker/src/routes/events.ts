import { Hono } from 'hono'
import { and, desc, eq, gt } from 'drizzle-orm'
import { events, trackedEmails } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const eventsRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * Returns events for the current user newer than ?since=<ms>, or the
 * last 5 minutes by default. Used by the extension SW after a push event
 * wakes it up — instead of carrying a payload, the SW pulls.
 */
eventsRouter.get('/recent', async (c) => {
  const userId = c.get('userId')
  const sinceParam = Number.parseInt(c.req.query('since') ?? '', 10)
  const since = Number.isFinite(sinceParam) && sinceParam > 0
    ? sinceParam
    : Date.now() - 5 * 60 * 1000

  const db = getDb(c.env.DB)
  const rows = await db
    .select({
      id: events.id,
      emailId: events.emailId,
      type: events.type,
      linkId: events.linkId,
      ts: events.ts,
      uaClass: events.uaClass,
      country: events.country,
      isFirstOpen: events.isFirstOpen,
    })
    .from(events)
    .innerJoin(trackedEmails, eq(events.emailId, trackedEmails.id))
    .where(and(eq(trackedEmails.userId, userId), gt(events.ts, since)))
    .orderBy(desc(events.ts))
    .limit(20)
    .all()

  return c.json({
    events: rows.map((r) => ({
      ...r,
      isFirstOpen: r.isFirstOpen === 1,
    })),
  })
})
