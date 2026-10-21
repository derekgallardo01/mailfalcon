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

import {
  escapeHtml as escape,
  renderButton,
  renderEmailShell,
} from './email-theme'

export function renderDigestHtml(args: {
  email: string
  stats: DigestStats
  webUrl: string
}): string {
  const { stats, webUrl } = args
  const rows =
    stats.topEmails.length === 0
      ? `<tr><td style="padding: 16px 12px; color: #64748b; font-size: 13px; text-align: center;">No tracked emails with activity today.</td></tr>`
      : stats.topEmails
          .map((e) => {
            const subj = e.subject
              ? escape(e.subject)
              : '<em style="color: #64748b;">(no subject)</em>'
            return `<tr>
              <td style="padding: 10px 12px; border-top: 1px solid #1e293b; font-size: 14px; color: #ffffff; line-height: 1.4;">
                <a href="${webUrl}/dashboard/email/?id=${encodeURIComponent(e.id)}" style="color: #ffffff; text-decoration: none; font-weight: 500;">${subj}</a>
              </td>
              <td style="padding: 10px 12px; border-top: 1px solid #1e293b; font-size: 12px; text-align: right; white-space: nowrap;">
                <span style="display: inline-block; background: #082f49; color: #38bdf8; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-right: 4px; border: 1px solid #0369a1;">${e.opens} opens</span>
                <span style="display: inline-block; background: #3b0764; color: #c084fc; font-weight: 600; padding: 2px 8px; border-radius: 10px; border: 1px solid #6b21a8;">${e.clicks} clicks</span>
              </td>
            </tr>`
          })
          .join('')

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return renderEmailShell({
    webUrl,
    preheader: `Daily summary: ${stats.humanOpens} opens, ${stats.clicks} clicks across ${stats.emailsSent} sent emails.`,
    badge: {
      text: 'Daily Summary',
      bg: '#082f49',
      fg: '#38bdf8',
    },
    title: 'Your daily summary',
    subtitle: `Activity report for ${todayStr}`,
    bodyHtml: `
      <!-- Stats 4-Grid -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0 24px;">
        <tr>
          <td style="padding: 14px 10px; background: #060a14; border: 1px solid #1e293b; border-radius: 10px; text-align: center; width: 23%;">
            <div style="font-size: 24px; font-weight: 800; color: #ffffff; line-height: 1.1;">${stats.emailsSent}</div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">Sent</div>
          </td>
          <td style="width: 2%;"></td>
          <td style="padding: 14px 10px; background: #052e16; border: 1px solid #166534; border-radius: 10px; text-align: center; width: 23%;">
            <div style="font-size: 24px; font-weight: 800; color: #4ade80; line-height: 1.1;">${stats.humanOpens}</div>
            <div style="font-size: 11px; font-weight: 700; color: #4ade80; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">Opens</div>
          </td>
          <td style="width: 2%;"></td>
          <td style="padding: 14px 10px; background: #3b0764; border: 1px solid #6b21a8; border-radius: 10px; text-align: center; width: 23%;">
            <div style="font-size: 24px; font-weight: 800; color: #c084fc; line-height: 1.1;">${stats.clicks}</div>
            <div style="font-size: 11px; font-weight: 700; color: #c084fc; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">Clicks</div>
          </td>
          <td style="width: 2%;"></td>
          <td style="padding: 14px 10px; background: #060a14; border: 1px solid #1e293b; border-radius: 10px; text-align: center; width: 23%;">
            <div style="font-size: 24px; font-weight: 800; color: #64748b; line-height: 1.1;">${stats.opens - stats.humanOpens}</div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">Bot Filtered</div>
          </td>
        </tr>
      </table>

      <!-- Top Emails Section -->
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Top performing emails today</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #060a14; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
        ${rows}
      </table>

      ${renderButton('Open Full Dashboard', `${webUrl}/dashboard`)}
    `,
    footerNote: `Manage daily summary frequency or unsubscribe in <a href="${webUrl}/settings" style="color: #94a3b8; text-decoration: underline;">Settings &rarr; Daily digest</a>.`,
  })
}

export function renderDigestText(stats: DigestStats, webUrl: string): string {
  const top = stats.topEmails
    .map((e, i) => `  ${i + 1}. ${e.subject ?? '(no subject)'} — ${e.opens} opens, ${e.clicks} clicks`)
    .join('\n')
  return [
    'Mail Falcon — your daily summary',
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
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to: args.email,
      subject: 'Your Mail Falcon daily summary',
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
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://mailfalcon.app'

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
