import { Hono } from 'hono'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
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
  workspaceMembers,
  workspaces,
} from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { createLogger, errorMeta } from '../lib/logger'
import { sendDeleteCode } from '../lib/mailer'
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
  quietStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  quietEndMinute: z.number().int().min(0).max(1439).nullable().optional(),
  quietTimezone: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v === '' || /^[A-Za-z]+\/[A-Za-z_/-]+$|^UTC$/.test(v),
      'invalid_tz',
    ),
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
  const activeWorkspaceId = c.get('workspaceId')
  const activeWorkspaceRole = c.get('workspaceRole')
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
      quietStartMinute: users.quietStartMinute,
      quietEndMinute: users.quietEndMinute,
      quietTimezone: users.quietTimezone,
      trialEndsAt: users.trialEndsAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  // Workspaces this caller is in, with name + role + member count.
  const workspaceRows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      isPersonal: workspaces.isPersonal,
      role: workspaceMembers.role,
      memberCount: sql<number>`(SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = ${workspaces.id})`,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .all()

  const activeWorkspace = workspaceRows.find((w) => w.id === activeWorkspaceId)
  const activeWorkspaceName = activeWorkspace?.name ?? 'Personal'

  // Tier inheritance: if the active workspace is owned by someone else
  // and that owner has a stronger tier, the caller inherits it. This
  // lets a workspace owner pay for a team-tier subscription and have
  // every member act with team-tier privileges.
  let effectiveTier: string = row.tier
  if (activeWorkspace && activeWorkspace.ownerId !== userId) {
    const owner = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.id, activeWorkspace.ownerId))
      .get()
    if (owner && tierRank(owner.tier) > tierRank(row.tier)) {
      effectiveTier = owner.tier
    }
  }

  // Trial layer: free users with an active trial get treated as 'pro'.
  // Doesn't override a workspace-owner inheritance to 'team' since team
  // outranks pro.
  const now = Date.now()
  const trialActive = row.trialEndsAt != null && row.trialEndsAt > now
  if (trialActive && tierRank(effectiveTier) < tierRank('pro')) {
    effectiveTier = 'pro'
  }
  const trialDaysRemaining = trialActive
    ? Math.ceil((row.trialEndsAt! - now) / 86_400_000)
    : 0

  const usage = await getUsage(c.env.KV, userId)
  return c.json({
    id: row.id,
    email: row.email,
    tier: effectiveTier,
    createdAt: row.createdAt,
    stripeCustId: row.stripeCustId,
    hasStripeCustomer: !!row.stripeCustId,
    digestEnabled: row.digestEnabled === 1,
    digestLastSentDay: row.digestLastSentDay,
    quietStartMinute: row.quietStartMinute,
    quietEndMinute: row.quietEndMinute,
    quietTimezone: row.quietTimezone,
    usage,
    activeWorkspaceId,
    activeWorkspaceName,
    activeWorkspaceRole,
    workspaces: workspaceRows.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      isPersonal: w.isPersonal === 1,
      memberCount: Number(w.memberCount),
    })),
    trialActive,
    trialDaysRemaining,
    trialEndsAt: row.trialEndsAt,
  })
})

/** Strict ranking — admin > team > pro > free > anything-else. Used to
 *  decide whether the workspace owner's tier raises a member's. */
function tierRank(tier: string): number {
  switch (tier) {
    case 'admin':
      return 4
    case 'team':
      return 3
    case 'pro':
      return 2
    case 'free':
      return 1
    default:
      return 0
  }
}

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
  if (parsed.data.quietStartMinute !== undefined) {
    updates.quietStartMinute = parsed.data.quietStartMinute
  }
  if (parsed.data.quietEndMinute !== undefined) {
    updates.quietEndMinute = parsed.data.quietEndMinute
  }
  if (parsed.data.quietTimezone !== undefined) {
    updates.quietTimezone =
      parsed.data.quietTimezone && parsed.data.quietTimezone.length > 0
        ? parsed.data.quietTimezone
        : null
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
 * Sessions live in D1 with a FK ON DELETE CASCADE on user_id — the
 * users row delete in the batch below kills every active JWT.
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

  // sessions table cascades on user delete, so the rows above already
  // killed every active JWT for this user.
  await c.env.KV.delete(`delete-confirm:${userId}`)

  return c.json({
    ok: true,
    stripeWarning: user.stripeCustId
      ? 'Cancel the Stripe subscription manually in the dashboard.'
      : null,
  })
})
