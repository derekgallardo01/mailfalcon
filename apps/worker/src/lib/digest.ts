import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import {
  events,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'

export interface DigestStats {
  emailsSent: number
  opens: number
  humanOpens: number
  clicks: number
  topEmails: Array<{
    id: string
    subject: string | null
    sentAt: number
    opens: number
    clicks: number
  }>
}

function utcStartOfDay(ts: number): number {
  const d = new Date(ts)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function computeStatsForUser(
  db: DB,
  userId: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<DigestStats> {
  const now = Date.now()
  const since = utcStartOfDay(now)
  const eventsSince = now - windowMs

  const [counts, topEmails] = await Promise.all([
    db
      .select({
        emailsSent: sql<number>`(
          SELECT COUNT(*) FROM ${trackedEmails}
          WHERE ${trackedEmails.userId} = ${userId}
            AND ${trackedEmails.sentAt} >= ${since}
        )`,
        opens: sql<number>`(
          SELECT COUNT(*) FROM ${events} e
          INNER JOIN ${trackedEmails} te ON te.id = e.email_id
          WHERE te.user_id = ${userId}
            AND e.type = 'open'
            AND e.ts >= ${eventsSince}
        )`,
        humanOpens: sql<number>`(
          SELECT COUNT(*) FROM ${events} e
          INNER JOIN ${trackedEmails} te ON te.id = e.email_id
          WHERE te.user_id = ${userId}
            AND e.type = 'open'
            AND e.ua_class != 'bot'
            AND e.ts >= ${eventsSince}
        )`,
        clicks: sql<number>`(
          SELECT COUNT(*) FROM ${events} e
          INNER JOIN ${trackedEmails} te ON te.id = e.email_id
          WHERE te.user_id = ${userId}
            AND e.type = 'click'
            AND e.ts >= ${eventsSince}
        )`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get(),
    db
      .select({
        id: trackedEmails.id,
        subject: trackedEmails.subject,
        sentAt: trackedEmails.sentAt,
        opens: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'open' AND ${events.uaClass} != 'bot' THEN 1 ELSE 0 END), 0)`,
        clicks: sql<number>`COALESCE(SUM(CASE WHEN ${events.type} = 'click' THEN 1 ELSE 0 END), 0)`,
      })
      .from(trackedEmails)
      .leftJoin(events, eq(events.emailId, trackedEmails.id))
      .where(
        and(
          eq(trackedEmails.userId, userId),
          gte(trackedEmails.sentAt, since),
        ),
      )
      .groupBy(trackedEmails.id)
      .orderBy(desc(sql`opens + clicks`))
      .limit(5)
      .all(),
  ])

  return {
    emailsSent: Number(counts?.emailsSent ?? 0),
    opens: Number(counts?.opens ?? 0),
    humanOpens: Number(counts?.humanOpens ?? 0),
    clicks: Number(counts?.clicks ?? 0),
    topEmails: topEmails.map((r) => ({
      id: r.id,
      subject: r.subject,
      sentAt: r.sentAt,
      opens: Number(r.opens),
      clicks: Number(r.clicks),
    })),
  }
}

function escape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderDigestHtml(args: {
  email: string
  stats: DigestStats
  webUrl: string
}): string {
  const { stats, webUrl } = args
  const rows =
    stats.topEmails.length === 0
      ? `<tr><td style="padding:12px;color:#9aaecd;font-size:13px;">No tracked emails today.</td></tr>`
      : stats.topEmails
          .map((e) => {
            const subj = e.subject ? escape(e.subject) : '<em style="color:#9aaecd;">(no subject)</em>'
            return `<tr>
              <td style="padding:8px 12px;border-top:1px solid #e3e9f2;font-size:14px;color:#0f1a2e;">
                <a href="${webUrl}/dashboard/email/?id=${encodeURIComponent(e.id)}" style="color:#0f1a2e;text-decoration:none;">${subj}</a>
              </td>
              <td style="padding:8px 12px;border-top:1px solid #e3e9f2;font-size:13px;color:#264168;text-align:right;white-space:nowrap;">
                ${e.opens} open${e.opens === 1 ? '' : 's'} · ${e.clicks} click${e.clicks === 1 ? '' : 's'}
              </td>
            </tr>`
          })
          .join('')

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon</p>
        </td></tr>
        <tr><td style="padding:0 28px;">
          <h1 style="margin:8px 0 4px;font-size:20px;font-weight:600;color:#0f1a2e;">Your daily summary</h1>
          <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${new Date().toUTCString().slice(0, 16)}</p>
        </td></tr>
        <tr><td style="padding:0 28px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:12px 8px;background:#f5f7fa;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#0f1a2e;">${stats.emailsSent}</div>
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">sent</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:12px 8px;background:#f5f7fa;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#0f1a2e;">${stats.humanOpens}</div>
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">opens</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:12px 8px;background:#f5f7fa;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#0f1a2e;">${stats.clicks}</div>
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">clicks</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:12px 8px;background:#f5f7fa;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#9aaecd;">${stats.opens - stats.humanOpens}</div>
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">bot opens</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Top emails today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;">
          <a href="${webUrl}/dashboard/" style="display:inline-block;background:#3b6cb7;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500;">Open dashboard →</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
        Don't want these? <a href="${webUrl}/settings/" style="color:#9ca3af;text-decoration:underline;">Settings → Daily digest</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

export function renderDigestText(stats: DigestStats, webUrl: string): string {
  const top = stats.topEmails
    .map((e, i) => `  ${i + 1}. ${e.subject ?? '(no subject)'} — ${e.opens} opens, ${e.clicks} clicks`)
    .join('\n')
  return [
    'MailFalcon — your daily summary',
    '',
    `Emails sent: ${stats.emailsSent}`,
    `Opens: ${stats.humanOpens} (excluding ${stats.opens - stats.humanOpens} bot opens)`,
    `Clicks: ${stats.clicks}`,
    '',
    stats.topEmails.length > 0 ? 'Top emails today:' : '',
    top,
    '',
    `Open dashboard: ${webUrl}/dashboard/`,
    `Unsubscribe / settings: ${webUrl}/settings/`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function sendDigestViaResend(args: {
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to: args.email,
      subject: 'Your MailFalcon daily summary',
      text: args.text,
      html: args.html,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend digest send failed: ${res.status} ${await res.text()}`)
  }
}

interface DigestEnv {
  ENVIRONMENT: string
  PUBLIC_WEB_URL?: string
  RESEND_API_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export async function sendDailyDigests(db: DB, env: DigestEnv): Promise<{
  considered: number
  skippedNoActivity: number
  skippedAlreadySent: number
  sent: number
  failed: number
}> {
  const today = todayKey()
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'

  // Digest is a Pro feature. Free users see an upgrade CTA in /settings
  // instead of the toggle. tier='admin' still gets the user digest in
  // addition to the admin platform digest — useful for dogfooding.
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      digestLastSentDay: users.digestLastSentDay,
    })
    .from(users)
    .where(
      and(
        eq(users.digestEnabled, 1),
        inArray(users.tier, ['pro', 'team', 'admin']),
      ),
    )
    .all()

  let considered = 0
  let skippedNoActivity = 0
  let skippedAlreadySent = 0
  let sent = 0
  let failed = 0

  for (const u of candidates) {
    considered++
    if (u.digestLastSentDay === today) {
      skippedAlreadySent++
      continue
    }

    const stats = await computeStatsForUser(db, u.id)
    if (stats.emailsSent === 0 && stats.opens === 0 && stats.clicks === 0) {
      // Don't spam users with empty digests, but still mark today as
      // sent so we don't recompute every minute on cron retry.
      await db
        .update(users)
        .set({ digestLastSentDay: today, digestLastSentSlot: 'evening' })
        .where(eq(users.id, u.id))
        .run()
      skippedNoActivity++
      continue
    }

    try {
      await sendDigestViaResend({
        email: u.email,
        html: renderDigestHtml({ email: u.email, stats, webUrl }),
        text: renderDigestText(stats, webUrl),
        env,
      })
      await db
        .update(users)
        .set({ digestLastSentDay: today, digestLastSentSlot: 'evening' })
        .where(eq(users.id, u.id))
        .run()
      sent++
    } catch (err) {
      createLogger({ env }).error('digest_send_failed', {
        recipient: u.email,
        ...errorMeta(err),
      })
      failed++
    }
  }

  return { considered, skippedNoActivity, skippedAlreadySent, sent, failed }
}
