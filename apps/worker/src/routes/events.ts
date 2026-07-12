import { Hono } from 'hono'
import { and, desc, eq, gt } from 'drizzle-orm'
import { events, recipients, trackedEmails, users } from '@mailfalcon/db/schema'
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

/** SHA-256 hex of the lowercased address — matches the extension's
 *  mint-time hash so we can compare a recipient row's stored
 *  hashedAddr against the caller's own email. */
async function sha256HexLower(address: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(address.toLowerCase()),
  )
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Returns events for the current user newer than ?since=<ms>, or the
 * last 5 minutes by default. Used by the extension SW after a push event
 * wakes it up — instead of carrying a payload, the SW pulls.
 *
 * Self-recipient opens (sender opens their own to-self or cc-self copy)
 * are filtered out here so the SW's push-fallback notification doesn't
 * fire for those. Dashboard totals still count them via /v1/emails.
 */
eventsRouter.get('/recent', async (c) => {
  const userId = c.get('userId')
  const sinceParam = Number.parseInt(c.req.query('since') ?? '', 10)
  const since = Number.isFinite(sinceParam) && sinceParam > 0
    ? sinceParam
    : Date.now() - 5 * 60 * 1000

  const db = getDb(c.env.DB)
  const [rows, sender] = await Promise.all([
    db
      .select({
        id: events.id,
        emailId: events.emailId,
        type: events.type,
        linkId: events.linkId,
        ts: events.ts,
        uaClass: events.uaClass,
        country: events.country,
        city: events.city,
        regionCode: events.regionCode,
        deviceType: events.deviceType,
        isFirstOpen: events.isFirstOpen,
        subject: trackedEmails.subject,
        recipientLabel: recipients.displayLabel,
        recipientHashedAddr: recipients.hashedAddr,
      })
      .from(events)
      .innerJoin(trackedEmails, eq(events.emailId, trackedEmails.id))
      .leftJoin(recipients, eq(recipients.id, events.recipientId))
      .where(and(eq(trackedEmails.userId, userId), gt(events.ts, since)))
      .orderBy(desc(events.ts))
      .limit(20)
      .all(),
    db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get(),
  ])

  const senderHash = sender ? await sha256HexLower(sender.email) : null
  const filtered = rows.filter((r) => {
    // Self-recipient open: the pixel URL was signed for the sender's
    // own address → Gmail rendering their own copy, not a real
    // recipient open.
    if (senderHash && r.recipientHashedAddr === senderHash) return false
    return true
  })

  return c.json({
    events: filtered.map(({ recipientHashedAddr, ...r }) => ({
      ...r,
      isFirstOpen: r.isFirstOpen === 1,
    })),
  })
})
