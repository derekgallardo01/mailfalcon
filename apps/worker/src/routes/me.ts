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
  middayDigestEnabled: z.boolean().optional(),
  hotLeadAlertsEnabled: z.boolean().optional(),
  emailNotifyOpen: z.boolean().optional(),
  emailNotifyClick: z.boolean().optional(),
  emailNotifyReply: z.boolean().optional(),
  emailNotifyHotLead: z.boolean().optional(),
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
  // Branded report fields. Empty string normalizes to null so the
  // report falls back to the MailFalcon brand.
  companyName: z.string().max(80).nullable().optional(),
  companyLogoUrl: z.string().url().max(500).nullable().optional(),
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
      middayDigestEnabled: users.middayDigestEnabled,
      hotLeadAlertsEnabled: users.hotLeadAlertsEnabled,
      emailNotifyOpen: users.emailNotifyOpen,
      emailNotifyClick: users.emailNotifyClick,
      emailNotifyReply: users.emailNotifyReply,
      emailNotifyHotLead: users.emailNotifyHotLead,
      customTrackerHost: users.customTrackerHost,
      customTrackerVerifiedAt: users.customTrackerVerifiedAt,
      companyName: users.companyName,
      companyLogoUrl: users.companyLogoUrl,
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
    middayDigestEnabled: row.middayDigestEnabled === 1,
    hotLeadAlertsEnabled: row.hotLeadAlertsEnabled === 1,
    emailNotifyOpen: row.emailNotifyOpen === 1,
    emailNotifyClick: row.emailNotifyClick === 1,
    emailNotifyReply: row.emailNotifyReply === 1,
    emailNotifyHotLead: row.emailNotifyHotLead === 1,
    // Tracker host the extension should bake into pixel + click URLs.
    // Falls back to t.mailfalcon.app when no verified custom domain.
    trackerHost:
      row.customTrackerHost && row.customTrackerVerifiedAt
        ? `https://${row.customTrackerHost}`
        : 'https://t.mailfalcon.app',
    customTrackerHost: row.customTrackerHost,
    customTrackerVerifiedAt: row.customTrackerVerifiedAt,
    companyName: row.companyName,
    companyLogoUrl: row.companyLogoUrl,
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
  if (parsed.data.middayDigestEnabled !== undefined) {
    updates.middayDigestEnabled = parsed.data.middayDigestEnabled ? 1 : 0
  }
  if (parsed.data.hotLeadAlertsEnabled !== undefined) {
    updates.hotLeadAlertsEnabled = parsed.data.hotLeadAlertsEnabled ? 1 : 0
  }
  if (parsed.data.emailNotifyOpen !== undefined) {
    updates.emailNotifyOpen = parsed.data.emailNotifyOpen ? 1 : 0
  }
  if (parsed.data.emailNotifyClick !== undefined) {
    updates.emailNotifyClick = parsed.data.emailNotifyClick ? 1 : 0
  }
  if (parsed.data.emailNotifyReply !== undefined) {
    updates.emailNotifyReply = parsed.data.emailNotifyReply ? 1 : 0
  }
  if (parsed.data.emailNotifyHotLead !== undefined) {
    updates.emailNotifyHotLead = parsed.data.emailNotifyHotLead ? 1 : 0
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
  if (parsed.data.companyName !== undefined) {
    updates.companyName =
      parsed.data.companyName && parsed.data.companyName.trim().length > 0
        ? parsed.data.companyName.trim()
        : null
  }
  if (parsed.data.companyLogoUrl !== undefined) {
    updates.companyLogoUrl = parsed.data.companyLogoUrl || null
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true })

  await db.update(users).set(updates).where(eq(users.id, userId)).run()
  return c.json({ ok: true })
})

/** Branded report — HTML at /v1/me/report?from=&to= (printable to PDF
 *  via browser), or CSV via ?format=csv. Agency-friendly. */
meRouter.get('/report', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const now = Date.now()
  const from = Math.max(0, Number(c.req.query('from')) || now - 30 * 86_400_000)
  const to = Math.max(from, Number(c.req.query('to')) || now)
  const format = c.req.query('format') === 'csv' ? 'csv' : 'html'

  const user = await db
    .select({
      email: users.email,
      companyName: users.companyName,
      companyLogoUrl: users.companyLogoUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) return c.json({ error: 'not_found' }, 404)

  const emails = await db
    .select({
      id: trackedEmails.id,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      recipientCount: trackedEmails.recipientCount,
      opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' THEN 1 ELSE 0 END), 0)`,
      humanOpens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
      clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      replies: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'reply' THEN 1 ELSE 0 END), 0)`,
      lastEventAt: sql<number | null>`MAX(${events.ts})`,
    })
    .from(trackedEmails)
    .leftJoin(events, eq(events.emailId, trackedEmails.id))
    .where(
      sql`${trackedEmails.userId} = ${userId} AND ${trackedEmails.sentAt} >= ${from} AND ${trackedEmails.sentAt} < ${to}`,
    )
    .groupBy(trackedEmails.id)
    .orderBy(sql`${trackedEmails.sentAt} DESC`)
    .all()

  if (format === 'csv') {
    const headers = [
      'id',
      'subject',
      'sentAt',
      'recipientCount',
      'opens',
      'humanOpens',
      'clicks',
      'replies',
      'lastEventAt',
    ]
    const rows = emails.map((r) =>
      [
        r.id,
        csvEscape(r.subject ?? ''),
        new Date(r.sentAt).toISOString(),
        r.recipientCount,
        Number(r.opens),
        Number(r.humanOpens),
        Number(r.clicks),
        Number(r.replies),
        r.lastEventAt ? new Date(r.lastEventAt).toISOString() : '',
      ].join(','),
    )
    const csv = [headers.join(','), ...rows].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="mailfalcon-report-${dateStamp(from)}-${dateStamp(to)}.csv"`,
      },
    })
  }

  const totals = emails.reduce(
    (acc, r) => {
      acc.opens += Number(r.opens)
      acc.humanOpens += Number(r.humanOpens)
      acc.clicks += Number(r.clicks)
      acc.replies += Number(r.replies)
      return acc
    },
    { opens: 0, humanOpens: 0, clicks: 0, replies: 0 },
  )

  const brandName = escapeHtml(user.companyName ?? 'MailFalcon')
  const brandLogo = user.companyLogoUrl
    ? `<img src="${escapeHtml(user.companyLogoUrl)}" alt="" style="height:32px;vertical-align:middle;margin-right:8px;">`
    : ''
  const periodLabel = `${dateStamp(from)} → ${dateStamp(to)}`

  const rowsHtml = emails
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.subject ?? '(no subject)')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;color:#6b7280;">${dateStamp(r.sentAt)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${r.recipientCount}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;color:${Number(r.humanOpens) > 0 ? '#0f1a2e' : '#9ca3af'};">${Number(r.humanOpens)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;color:${Number(r.clicks) > 0 ? '#0f1a2e' : '#9ca3af'};">${Number(r.clicks)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;color:${Number(r.replies) > 0 ? '#0f1a2e' : '#9ca3af'};">${Number(r.replies)}</td>
        </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>${brandName} report — ${periodLabel}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f1a2e; margin:0; padding:32px; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:14px; color:#3b6cb7; margin:24px 0 8px; text-transform:uppercase; letter-spacing:0.05em; }
  .meta { color:#6b7280; font-size:12px; }
  .cards { display:flex; gap:16px; flex-wrap:wrap; margin:24px 0; }
  .card { flex:1; min-width:140px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 16px; }
  .card .label { font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; }
  .card .value { font-size:24px; font-weight:600; margin-top:4px; font-variant-numeric:tabular-nums; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { padding:8px 12px; text-align:left; background:#f3f4f6; border-bottom:1px solid #e5e7eb; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; font-weight:600; }
  .print-hint { background:#fef3c7; border:1px solid #fde68a; padding:8px 12px; border-radius:6px; font-size:11px; color:#92400e; margin:0 0 16px; }
  @media print { .print-hint { display:none; } body { padding:0; } }
  .footer { margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; text-align:center; }
</style>
</head><body>
<div class="print-hint">📄 Use File → Print → Save as PDF to export this report.</div>
<h1>${brandLogo}${brandName}</h1>
<p class="meta">Tracked-email report · ${escapeHtml(periodLabel)} · ${escapeHtml(user.email)}</p>
<div class="cards">
  <div class="card"><p class="label">Emails sent</p><p class="value">${emails.length}</p></div>
  <div class="card"><p class="label">Opens (human)</p><p class="value">${totals.humanOpens}</p></div>
  <div class="card"><p class="label">Clicks</p><p class="value">${totals.clicks}</p></div>
  <div class="card"><p class="label">Replies</p><p class="value">${totals.replies}</p></div>
</div>
<h2>Per-email breakdown</h2>
<table>
  <thead><tr>
    <th>Subject</th><th>Sent</th><th style="text-align:right">To</th><th style="text-align:right">Opens</th><th style="text-align:right">Clicks</th><th style="text-align:right">Replies</th>
  </tr></thead>
  <tbody>${rowsHtml || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">No tracked emails in this period.</td></tr>'}</tbody>
</table>
<p class="footer">${user.companyName ? `Generated by ${escapeHtml(user.companyName)} · ` : ''}Powered by MailFalcon</p>
</body></html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})

function csvEscape(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replaceAll('"', '""') + '"'
  }
  return s
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function dateStamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

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
