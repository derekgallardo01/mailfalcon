import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import {
  events,
  followUps,
  links,
  notificationSubscriptions,
  recipients,
  subscriptions,
  templates,
  trackedEmails,
  usageCounters,
  users,
} from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { createLogger, errorMeta } from '../lib/logger'
import { sendDeleteCode } from '../lib/mailer'
import { sweepUserSessions } from '../lib/sessions'
import { getUsage } from '../lib/usage'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  KV: KVNamespace
  RESEND_API_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

const patchSchema = z.object({
  digestEnabled: z.boolean().optional(),
})

const deleteConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
})

function newSixDigitCode(): string {
  const buf = new Uint8Array(4)
  crypto.getRandomValues(buf)
  const num =
    (((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0) %
    900000
  return String(100000 + num)
}

export const meRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

meRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      createdAt: users.createdAt,
      stripeCustId: users.stripeCustId,
      digestEnabled: users.digestEnabled,
      digestLastSentDay: users.digestLastSentDay,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const usage = await getUsage(c.env.KV, userId)
  return c.json({
    id: row.id,
    email: row.email,
    tier: row.tier,
    createdAt: row.createdAt,
    stripeCustId: row.stripeCustId,
    hasStripeCustomer: !!row.stripeCustId,
    digestEnabled: row.digestEnabled === 1,
    digestLastSentDay: row.digestLastSentDay,
    usage,
  })
})

meRouter.patch('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (parsed.data.digestEnabled !== undefined) {
    updates.digestEnabled = parsed.data.digestEnabled ? 1 : 0
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true })

  await db.update(users).set(updates).where(eq(users.id, userId)).run()
  return c.json({ ok: true })
})

/**
 * GET /v1/me/export — returns a JSON dump of every row scoped to the
 * caller. Used by the "Download my data" button on /settings to honour
 * GDPR right-of-access requests without manual ops involvement.
 */
meRouter.get('/export', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const user = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) return c.json({ error: 'not_found' }, 404)

  const [
    trackedEmailRows,
    linkRows,
    recipientRows,
    eventRows,
    templateRows,
    followUpRows,
    notifSubRows,
    subRows,
    usageRows,
  ] = await Promise.all([
    db.select().from(trackedEmails).where(eq(trackedEmails.userId, userId)).all(),
    db
      .select()
      .from(links)
      .innerJoin(trackedEmails, eq(trackedEmails.id, links.emailId))
      .where(eq(trackedEmails.userId, userId))
      .all(),
    db
      .select()
      .from(recipients)
      .innerJoin(trackedEmails, eq(trackedEmails.id, recipients.emailId))
      .where(eq(trackedEmails.userId, userId))
      .all(),
    db
      .select()
      .from(events)
      .innerJoin(trackedEmails, eq(trackedEmails.id, events.emailId))
      .where(eq(trackedEmails.userId, userId))
      .all(),
    db.select().from(templates).where(eq(templates.userId, userId)).all(),
    db.select().from(followUps).where(eq(followUps.userId, userId)).all(),
    db
      .select({
        id: notificationSubscriptions.id,
        endpoint: notificationSubscriptions.endpoint,
        ua: notificationSubscriptions.ua,
        createdAt: notificationSubscriptions.createdAt,
      })
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.userId, userId))
      .all(),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all(),
    db.select().from(usageCounters).where(eq(usageCounters.userId, userId)).all(),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    user,
    trackedEmails: trackedEmailRows,
    // The inner joins return { links: {...}, tracked_emails: {...} }
    // shape — flatten to just the source table's columns.
    links: linkRows.map((r) => r.links),
    recipients: recipientRows.map((r) => r.recipients),
    events: eventRows.map((r) => r.events),
    templates: templateRows,
    followUps: followUpRows,
    notificationSubscriptions: notifSubRows,
    subscriptions: subRows,
    usageCounters: usageRows,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mailfalcon-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

/**
 * POST /v1/me/delete-request — step 1 of GDPR self-serve account
 * deletion. Mints a 6-digit code, stores it in KV under
 * delete-confirm:{userId} with a 15-min TTL, and emails it via Resend.
 */
meRouter.post('/delete-request', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const user = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) return c.json({ error: 'not_found' }, 404)

  const code = newSixDigitCode()
  await c.env.KV.put(`delete-confirm:${userId}`, code, { expirationTtl: 900 })

  try {
    await sendDeleteCode({ email: user.email, code, env: c.env })
  } catch (err) {
    createLogger({
      env: c.env,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    }).error('delete_code_send_failed', { email: user.email, ...errorMeta(err) })
  }

  return c.json({ ok: true })
})

/**
 * DELETE /v1/me — step 2 of account deletion. Validates the code minted
 * by /delete-request, then cascades a hard delete:
 *   - tracked_emails  → cascades links + recipients + events + follow_ups
 *     (via FK onDelete:cascade in packages/db/src/schema.ts)
 *   - usage_counters  → cascades from users.id
 *   - templates, subscriptions, notification_subscriptions  → explicit
 *     (no cascade FK defined)
 *   - users row last
 *
 * KV sessions are swept via the sessions-by-user index maintained on
 * auth/verify and auth/logout — every session:{jti} the user has is
 * deleted so a stolen JWT can't outlive the account.
 *
 * Stripe subscription cancellation is NOT performed here. If the user
 * has a stripeCustId, the response surfaces a warning so the operator
 * can cancel it manually in the Stripe dashboard.
 */
meRouter.delete('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = deleteConfirmSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const expected = await c.env.KV.get(`delete-confirm:${userId}`)
  if (!expected) return c.json({ error: 'expired_or_unknown' }, 400)
  if (expected !== parsed.data.code) return c.json({ error: 'wrong_code' }, 401)

  const db = getDb(c.env.DB)
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      stripeCustId: users.stripeCustId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) {
    await c.env.KV.delete(`delete-confirm:${userId}`)
    return c.json({ error: 'not_found' }, 404)
  }

  await db.batch([
    db.delete(trackedEmails).where(eq(trackedEmails.userId, userId)),
    db.delete(templates).where(eq(templates.userId, userId)),
    db.delete(subscriptions).where(eq(subscriptions.userId, userId)),
    db
      .delete(notificationSubscriptions)
      .where(eq(notificationSubscriptions.userId, userId)),
    db.delete(usageCounters).where(eq(usageCounters.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ])

  const sweptSessions = await sweepUserSessions(c.env.KV, userId)
  await c.env.KV.delete(`delete-confirm:${userId}`)

  return c.json({
    ok: true,
    stripeWarning: user.stripeCustId
      ? 'Cancel the Stripe subscription manually in the dashboard.'
      : null,
    sessionsSwept: sweptSessions,
  })
})
