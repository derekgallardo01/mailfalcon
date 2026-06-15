import { and, desc, eq, gte, sql } from 'drizzle-orm'
import {
  events,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import type { DB } from './db'

interface AdminDigestEnv {
  ENVIRONMENT: string
  PUBLIC_WEB_URL?: string
  RESEND_API_KEY?: string
}

interface AdminStats {
  totals: {
    users: number
    emails: number
    events: number
  }
  today: {
    newUsers: number
    emailsSent: number
    opens: number
    humanOpens: number
    clicks: number
  }
  byTier: { tier: string; count: number }[]
  newUsers: { email: string; createdAt: number; tier: string }[]
  topSenders: { email: string; emails: number; opens: number; clicks: number }[]
}

function utcStartOfDay(ts: number): number {
  const d = new Date(ts)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function escape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export async function computeAdminStats(db: DB): Promise<AdminStats> {
  const start = utcStartOfDay(Date.now())

  const [totals, today, byTier, newUsers, topSenders] = await Promise.all([
    db
      .select({
        users: sql<number>`(SELECT COUNT(*) FROM ${users})`,
        emails: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails})`,
        events: sql<number>`(SELECT COUNT(*) FROM ${events})`,
      })
      .from(users)
      .limit(1)
      .get(),
    db
      .select({
        newUsers: sql<number>`(SELECT COUNT(*) FROM ${users} WHERE ${users.createdAt} >= ${start})`,
        emailsSent: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails} WHERE ${trackedEmails.sentAt} >= ${start})`,
        opens: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.type} = 'open' AND ${events.ts} >= ${start})`,
        humanOpens: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.type} = 'open' AND ${events.uaClass} != 'bot' AND ${events.ts} >= ${start})`,
        clicks: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.type} = 'click' AND ${events.ts} >= ${start})`,
      })
      .from(users)
      .limit(1)
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
        email: users.email,
        createdAt: users.createdAt,
        tier: users.tier,
      })
      .from(users)
      .where(gte(users.createdAt, start))
      .orderBy(desc(users.createdAt))
      .limit(20)
      .all(),
    db
      .select({
        email: users.email,
        emails: sql<number>`COUNT(DISTINCT ${trackedEmails.id})`,
        opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
        clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      })
      .from(users)
      .innerJoin(trackedEmails, eq(trackedEmails.userId, users.id))
      .leftJoin(events, eq(events.emailId, trackedEmails.id))
      .where(gte(trackedEmails.sentAt, start))
      .groupBy(users.id)
      .orderBy(desc(sql`COUNT(DISTINCT ${trackedEmails.id})`))
      .limit(10)
      .all(),
  ])

  return {
    totals: {
      users: Number(totals?.users ?? 0),
      emails: Number(totals?.emails ?? 0),
      events: Number(totals?.events ?? 0),
    },
    today: {
      newUsers: Number(today?.newUsers ?? 0),
      emailsSent: Number(today?.emailsSent ?? 0),
      opens: Number(today?.opens ?? 0),
      humanOpens: Number(today?.humanOpens ?? 0),
      clicks: Number(today?.clicks ?? 0),
    },
    byTier: byTier.map((r) => ({ tier: r.tier, count: Number(r.count) })),
    newUsers: newUsers.map((r) => ({
      email: r.email,
      createdAt: r.createdAt,
      tier: r.tier,
    })),
    topSenders: topSenders.map((r) => ({
      email: r.email,
      emails: Number(r.emails),
      opens: Number(r.opens),
      clicks: Number(r.clicks),
    })),
  }
}

function renderAdminHtml(args: { stats: AdminStats; webUrl: string }): string {
  const { stats, webUrl } = args

  const tierRows = stats.byTier
    .map(
      (r) =>
        `<tr><td style="padding:4px 0;font-size:13px;color:#264168;text-transform:capitalize;">${escape(r.tier)}</td><td style="padding:4px 0;font-size:13px;color:#0f1a2e;font-weight:600;text-align:right;">${r.count}</td></tr>`,
    )
    .join('')

  const newUserRows =
    stats.newUsers.length === 0
      ? `<tr><td style="padding:8px 0;font-size:13px;color:#9aaecd;">No new signups today.</td></tr>`
      : stats.newUsers
          .map(
            (u) =>
              `<tr>
                <td style="padding:6px 0;font-size:13px;color:#0f1a2e;">${escape(u.email)}</td>
                <td style="padding:6px 0;font-size:11px;color:#9aaecd;text-align:right;text-transform:uppercase;">${escape(u.tier)}</td>
              </tr>`,
          )
          .join('')

  const topSenderRows =
    stats.topSenders.length === 0
      ? `<tr><td style="padding:8px 0;font-size:13px;color:#9aaecd;">No sends today.</td></tr>`
      : stats.topSenders
          .map(
            (s) =>
              `<tr>
                <td style="padding:6px 0;font-size:13px;color:#0f1a2e;">${escape(s.email)}</td>
                <td style="padding:6px 0;font-size:12px;color:#264168;text-align:right;white-space:nowrap;">
                  ${s.emails} sent · ${s.opens} opens · ${s.clicks} clicks
                </td>
              </tr>`,
          )
          .join('')

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#b45309;letter-spacing:0.02em;">MailFalcon · admin</p>
        </td></tr>
        <tr><td style="padding:0 28px;">
          <h1 style="margin:8px 0 4px;font-size:20px;font-weight:600;color:#0f1a2e;">Platform daily report</h1>
          <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${new Date().toUTCString().slice(0, 16)} · UTC</p>
        </td></tr>

        <tr><td style="padding:0 28px 8px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:10px 6px;background:#f5f7fa;border-radius:8px;text-align:center;width:20%;">
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;">${stats.today.newUsers}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">new users</div>
              </td>
              <td style="width:4px;"></td>
              <td style="padding:10px 6px;background:#f5f7fa;border-radius:8px;text-align:center;width:20%;">
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;">${stats.today.emailsSent}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">sent</div>
              </td>
              <td style="width:4px;"></td>
              <td style="padding:10px 6px;background:#f5f7fa;border-radius:8px;text-align:center;width:20%;">
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;">${stats.today.humanOpens}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">opens</div>
              </td>
              <td style="width:4px;"></td>
              <td style="padding:10px 6px;background:#f5f7fa;border-radius:8px;text-align:center;width:20%;">
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;">${stats.today.clicks}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">clicks</div>
              </td>
              <td style="width:4px;"></td>
              <td style="padding:10px 6px;background:#f5f7fa;border-radius:8px;text-align:center;width:20%;">
                <div style="font-size:20px;font-weight:700;color:#9aaecd;">${stats.today.opens - stats.today.humanOpens}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">bots</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 28px 4px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">All-time totals</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;">
            <tr>
              <td style="padding:4px 0;color:#264168;">Users</td>
              <td style="padding:4px 0;text-align:right;color:#0f1a2e;font-weight:600;">${stats.totals.users}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#264168;">Tracked emails</td>
              <td style="padding:4px 0;text-align:right;color:#0f1a2e;font-weight:600;">${stats.totals.emails}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#264168;">Events</td>
              <td style="padding:4px 0;text-align:right;color:#0f1a2e;font-weight:600;">${stats.totals.events}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 4px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Users by tier</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${tierRows}
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 4px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">New signups today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${newUserRows}
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 4px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Top senders today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${topSenderRows}
          </table>
        </td></tr>

        <tr><td style="padding:24px 28px 28px;">
          <a href="${webUrl}/admin/" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500;">Open admin dashboard →</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
        Admin reports are sent to every account with tier=admin. Promote via D1 if you need to add more.
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

function renderAdminText(stats: AdminStats, webUrl: string): string {
  return [
    'MailFalcon · admin daily report',
    '',
    'Today:',
    `  New users: ${stats.today.newUsers}`,
    `  Emails sent: ${stats.today.emailsSent}`,
    `  Opens: ${stats.today.humanOpens} (human) + ${stats.today.opens - stats.today.humanOpens} (bots)`,
    `  Clicks: ${stats.today.clicks}`,
    '',
    'All-time:',
    `  Users: ${stats.totals.users}`,
    `  Tracked emails: ${stats.totals.emails}`,
    `  Events: ${stats.totals.events}`,
    '',
    'By tier:',
    stats.byTier.map((r) => `  ${r.tier}: ${r.count}`).join('\n'),
    '',
    stats.newUsers.length > 0
      ? `New signups (${stats.newUsers.length}):\n` +
        stats.newUsers.map((u) => `  ${u.email} (${u.tier})`).join('\n')
      : 'No new signups today.',
    '',
    stats.topSenders.length > 0
      ? `Top senders:\n` +
        stats.topSenders
          .map(
            (s) =>
              `  ${s.email}: ${s.emails} sent, ${s.opens} opens, ${s.clicks} clicks`,
          )
          .join('\n')
      : '',
    '',
    `Admin dashboard: ${webUrl}/admin/`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function sendAdminDigestViaResend(args: {
  email: string
  html: string
  text: string
  env: { RESEND_API_KEY?: string }
}): Promise<void> {
  if (!args.env.RESEND_API_KEY) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'MailFalcon Admin <hello@mailfalcon.app>',
      to: args.email,
      subject: `MailFalcon admin report — ${new Date().toUTCString().slice(0, 16)}`,
      text: args.text,
      html: args.html,
    }),
  })
  if (!res.ok) {
    throw new Error(
      `Resend admin digest send failed: ${res.status} ${await res.text()}`,
    )
  }
}

export async function sendAdminDigests(
  db: DB,
  env: AdminDigestEnv,
): Promise<{
  admins: number
  sent: number
  failed: number
}> {
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'

  const admins = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.tier, 'admin'))
    .all()

  if (admins.length === 0) {
    return { admins: 0, sent: 0, failed: 0 }
  }

  // Compute the platform stats ONCE — every admin gets the same snapshot.
  const stats = await computeAdminStats(db)
  const html = renderAdminHtml({ stats, webUrl })
  const text = renderAdminText(stats, webUrl)

  let sent = 0
  let failed = 0

  await Promise.all(
    admins.map(async (admin) => {
      try {
        await sendAdminDigestViaResend({
          email: admin.email,
          html,
          text,
          env,
        })
        sent++
      } catch (err) {
        console.error('[mailfalcon] admin digest send failed for', admin.email, err)
        failed++
      }
    }),
  )

  return { admins: admins.length, sent, failed }
}

// Suppress unused-import warnings if the schema-related helpers are
// trimmed by the bundler.
void todayKey
void and
