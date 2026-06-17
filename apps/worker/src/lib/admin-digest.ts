import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import {
  events,
  followUps,
  notificationSubscriptions,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'

interface AdminDigestEnv {
  ENVIRONMENT: string
  PUBLIC_WEB_URL?: string
  RESEND_API_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
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
  /** Totals for the 7 calendar days BEFORE today (rolling, excluding today). */
  trend7d: {
    emailsSent: number
    humanOpens: number
    clicks: number
  }
  engagement: {
    topEmail: {
      subject: string | null
      sender: string
      opens: number
    } | null
    topCountries: { country: string; opens: number }[]
    deviceSplit: { desktop: number; mobile: number; other: number }
  }
  ops: {
    /** Distinct users who sent at least one tracked email today. */
    dau: number
    /** Active Web Push subscriptions across all users. */
    pushSubs: number
    /** Follow-ups with fired=0 whose remindAt falls in the next 24 hours. */
    pendingFollowups: number
  }
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
  const sevenDaysAgo = start - 7 * 86_400_000
  const next24h = Date.now() + 86_400_000

  const [
    totals,
    today,
    byTier,
    newUsers,
    topSenders,
    trend,
    topCountriesRows,
    deviceRows,
    dauRow,
    pushSubsRow,
    pendingFollowupsRow,
    topOpenedRow,
  ] = await Promise.all([
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
    // 7-day rolling totals (excluding today). For the trend row.
    db
      .select({
        emailsSent: sql<number>`(SELECT COUNT(*) FROM ${trackedEmails} WHERE ${trackedEmails.sentAt} >= ${sevenDaysAgo} AND ${trackedEmails.sentAt} < ${start})`,
        humanOpens: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.type} = 'open' AND ${events.uaClass} != 'bot' AND ${events.ts} >= ${sevenDaysAgo} AND ${events.ts} < ${start})`,
        clicks: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.type} = 'click' AND ${events.ts} >= ${sevenDaysAgo} AND ${events.ts} < ${start})`,
      })
      .from(users)
      .limit(1)
      .get(),
    // Top countries today (human opens only).
    db
      .select({
        country: events.country,
        opens: sql<number>`COUNT(*)`,
      })
      .from(events)
      .where(
        and(
          eq(events.type, 'open'),
          ne(events.uaClass, 'bot'),
          gte(events.ts, start),
          sql`${events.country} IS NOT NULL`,
        ),
      )
      .groupBy(events.country)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(3)
      .all(),
    // Device class breakdown of human opens today.
    db
      .select({
        uaClass: events.uaClass,
        n: sql<number>`COUNT(*)`,
      })
      .from(events)
      .where(
        and(
          eq(events.type, 'open'),
          ne(events.uaClass, 'bot'),
          gte(events.ts, start),
        ),
      )
      .groupBy(events.uaClass)
      .all(),
    // DAU — distinct senders today.
    db
      .select({ dau: sql<number>`COUNT(DISTINCT ${trackedEmails.userId})` })
      .from(trackedEmails)
      .where(gte(trackedEmails.sentAt, start))
      .get(),
    // Active push subscriptions across the platform.
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notificationSubscriptions)
      .get(),
    // Follow-ups due in the next 24 hours that haven't fired yet.
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(followUps)
      .where(and(eq(followUps.fired, 0), lte(followUps.remindAt, next24h)))
      .get(),
    // Top-engaged email TODAY (most human opens). Subquery counts the
    // events that happened today against each tracked email, then we
    // order by that count.
    db
      .select({
        id: trackedEmails.id,
        subject: trackedEmails.subject,
        sender: users.email,
        opens: sql<number>`(SELECT COUNT(*) FROM ${events} WHERE ${events.emailId} = ${trackedEmails.id} AND ${events.type} = 'open' AND ${events.uaClass} != 'bot' AND ${events.ts} >= ${start})`,
      })
      .from(trackedEmails)
      .innerJoin(users, eq(users.id, trackedEmails.userId))
      .orderBy(desc(sql`(SELECT COUNT(*) FROM ${events} WHERE ${events.emailId} = ${trackedEmails.id} AND ${events.type} = 'open' AND ${events.uaClass} != 'bot' AND ${events.ts} >= ${start})`))
      .limit(1)
      .get(),
  ])

  const deviceSplit = (() => {
    let desktop = 0
    let mobile = 0
    let other = 0
    for (const r of deviceRows) {
      const n = Number(r.n)
      if (r.uaClass === 'desktop') desktop = n
      else if (r.uaClass === 'mobile') mobile = n
      else other += n
    }
    return { desktop, mobile, other }
  })()

  const topEmailOpens = Number(topOpenedRow?.opens ?? 0)
  const topEmail =
    topOpenedRow && topEmailOpens > 0
      ? {
          subject: topOpenedRow.subject,
          sender: topOpenedRow.sender,
          opens: topEmailOpens,
        }
      : null

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
    trend7d: {
      emailsSent: Number(trend?.emailsSent ?? 0),
      humanOpens: Number(trend?.humanOpens ?? 0),
      clicks: Number(trend?.clicks ?? 0),
    },
    engagement: {
      topEmail,
      topCountries: topCountriesRows
        .filter((r): r is { country: string; opens: number } => !!r.country)
        .map((r) => ({ country: r.country, opens: Number(r.opens) })),
      deviceSplit,
    },
    ops: {
      dau: Number(dauRow?.dau ?? 0),
      pushSubs: Number(pushSubsRow?.n ?? 0),
      pendingFollowups: Number(pendingFollowupsRow?.n ?? 0),
    },
    topSenders: topSenders.map((r) => ({
      email: r.email,
      emails: Number(r.emails),
      opens: Number(r.opens),
      clicks: Number(r.clicks),
    })),
  }
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? email
  const parts = local.split(/[._\- ]+/).filter(Boolean)
  if (parts.length === 0) return email.slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

function tierColor(tier: string): { bg: string; fg: string } {
  if (tier === 'admin') return { bg: '#fef3c7', fg: '#92400e' }
  if (tier === 'pro') return { bg: '#dcfce7', fg: '#166534' }
  if (tier === 'team') return { bg: '#dbeafe', fg: '#1e40af' }
  return { bg: '#e3e9f2', fg: '#264168' }
}

function trendCell(label: string, todayN: number, weekTotal: number): string {
  const avg = weekTotal / 7
  const delta = todayN - avg
  // ε avoids flagging 0.0001 noise as a change.
  const epsilon = Math.max(0.1, avg * 0.05)
  const up = delta > epsilon
  const down = delta < -epsilon
  const arrow = up ? '↑' : down ? '↓' : '→'
  const arrowColor = up ? '#166534' : down ? '#b91c1c' : '#6886b1'
  return `<td style="padding:14px 16px;background:#f5f7fa;border-radius:10px;width:33%;">
    <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${label}</div>
    <div style="font-size:18px;font-weight:700;color:#0f1a2e;margin-top:4px;">${todayN}</div>
    <div style="font-size:11px;color:#6886b1;margin-top:3px;">
      <span style="color:${arrowColor};font-weight:700;">${arrow}</span> vs ${avg.toFixed(1)}/d avg
    </div>
  </td>`
}

function deviceBar(d: { desktop: number; mobile: number; other: number }): string {
  const total = d.desktop + d.mobile + d.other
  if (total === 0) {
    return `<p style="margin:0;font-size:13px;color:#9aaecd;">No human opens yet today.</p>`
  }
  const pct = (n: number): number => Math.round((n / total) * 100)
  const dPct = pct(d.desktop)
  const mPct = pct(d.mobile)
  const oPct = 100 - dPct - mPct
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:2px;border-radius:6px;overflow:hidden;">
      <tr style="height:10px;">
        ${d.desktop > 0 ? `<td style="background:#3b6cb7;width:${dPct}%;"></td>` : ''}
        ${d.mobile > 0 ? `<td style="background:#9aaecd;width:${mPct}%;"></td>` : ''}
        ${d.other > 0 ? `<td style="background:#c4d0e3;width:${oPct}%;"></td>` : ''}
      </tr>
    </table>
    <p style="margin:6px 0 0;font-size:11px;color:#6886b1;">
      ${d.desktop > 0 ? `<span style="display:inline-block;width:8px;height:8px;background:#3b6cb7;border-radius:2px;vertical-align:middle;"></span> Desktop ${dPct}%` : ''}
      ${d.mobile > 0 ? `&nbsp;&nbsp;<span style="display:inline-block;width:8px;height:8px;background:#9aaecd;border-radius:2px;vertical-align:middle;"></span> Mobile ${mPct}%` : ''}
      ${d.other > 0 ? `&nbsp;&nbsp;<span style="display:inline-block;width:8px;height:8px;background:#c4d0e3;border-radius:2px;vertical-align:middle;"></span> Other ${oPct}%` : ''}
    </p>
  `
}

function renderAdminHtml(args: { stats: AdminStats; webUrl: string }): string {
  const { stats, webUrl } = args
  const dateStr = new Date().toUTCString().slice(0, 16)
  const botCount = stats.today.opens - stats.today.humanOpens

  const tierPills = stats.byTier
    .map((r) => {
      const c = tierColor(r.tier)
      return `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;background:${c.bg};color:${c.fg};border-radius:999px;font-size:12px;font-weight:500;"><strong style="font-weight:700;">${r.count}</strong>&nbsp;${escape(r.tier)}</span>`
    })
    .join('')

  const newUserRows =
    stats.newUsers.length === 0
      ? `<tr><td style="padding:14px 16px;background:#f5f7fa;border-radius:10px;font-size:13px;color:#9aaecd;text-align:center;">No new signups today.</td></tr>`
      : stats.newUsers
          .map((u) => {
            const c = tierColor(u.tier)
            return `<tr><td style="padding:0 0 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;border-radius:10px;">
                <tr>
                  <td style="padding:10px 14px;width:36px;vertical-align:middle;">
                    <div style="width:32px;height:32px;background:#264168;color:#ffffff;border-radius:50%;text-align:center;line-height:32px;font-size:12px;font-weight:600;letter-spacing:0.02em;">${initials(u.email)}</div>
                  </td>
                  <td style="padding:10px 8px;vertical-align:middle;font-size:13px;color:#0f1a2e;font-weight:500;word-break:break-all;">${escape(u.email)}</td>
                  <td style="padding:10px 14px;vertical-align:middle;text-align:right;white-space:nowrap;">
                    <span style="display:inline-block;padding:3px 9px;background:${c.bg};color:${c.fg};border-radius:999px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">${escape(u.tier)}</span>
                  </td>
                </tr>
              </table>
            </td></tr>`
          })
          .join('')

  const topSenderRows =
    stats.topSenders.length === 0
      ? `<tr><td style="padding:14px 16px;background:#f5f7fa;border-radius:10px;font-size:13px;color:#9aaecd;text-align:center;">No sends today.</td></tr>`
      : stats.topSenders
          .map(
            (s, i) =>
              `<tr><td style="padding:0 0 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;border-radius:10px;">
                <tr>
                  <td style="padding:10px 14px;width:36px;vertical-align:middle;">
                    <div style="width:28px;height:28px;background:#ffffff;border:1px solid #c4d0e3;color:#264168;border-radius:50%;text-align:center;line-height:28px;font-size:11px;font-weight:700;">${i + 1}</div>
                  </td>
                  <td style="padding:10px 8px;vertical-align:middle;">
                    <div style="font-size:13px;color:#0f1a2e;font-weight:500;word-break:break-all;">${escape(s.email)}</div>
                    <div style="font-size:11px;color:#6886b1;margin-top:3px;">
                      <strong style="color:#264168;">${s.emails}</strong> sent ·
                      <strong style="color:#166534;">${s.opens}</strong> opens ·
                      <strong style="color:#1e40af;">${s.clicks}</strong> clicks
                    </div>
                  </td>
                </tr>
              </table>
            </td></tr>`,
          )
          .join('')

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#eef2f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#0f1a2e;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2f9;padding:32px 16px;">
    <tr><td align="center">

      <!-- Brand pill -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;">
        <tr><td style="padding:6px 14px;background:#264168;border-radius:999px;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.08em;text-transform:uppercase;">
          MailFalcon · admin
        </td></tr>
      </table>

      <!-- Main card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;border:1px solid #e3e9f2;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:32px 32px 0;">
          <h1 style="margin:0;font-size:24px;font-weight:700;color:#0f1a2e;letter-spacing:-0.01em;">Platform daily report</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#6886b1;">${dateStr} · UTC</p>
        </td></tr>

        <!-- Hero metric -->
        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#264168;border-radius:14px;">
            <tr><td style="padding:24px 26px;">
              <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9aaecd;font-weight:600;">Emails tracked today</p>
              <p style="margin:6px 0 0;font-size:46px;font-weight:700;letter-spacing:-0.025em;color:#ffffff;line-height:1;">${stats.today.emailsSent}</p>
              <p style="margin:12px 0 0;font-size:13px;color:#c4d0e3;">
                <strong style="color:#ffffff;">${stats.today.humanOpens}</strong> opens ·
                <strong style="color:#ffffff;">${stats.today.clicks}</strong> clicks ·
                ${botCount} bot${botCount === 1 ? '' : 's'} filtered
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- 7-day trend -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Today vs prior 7 days</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              ${trendCell('Sent', stats.today.emailsSent, stats.trend7d.emailsSent)}
              <td style="width:8px;"></td>
              ${trendCell('Opens', stats.today.humanOpens, stats.trend7d.humanOpens)}
              <td style="width:8px;"></td>
              ${trendCell('Clicks', stats.today.clicks, stats.trend7d.clicks)}
            </tr>
          </table>
        </td></tr>

        <!-- Today chips -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Today's activity</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:14px 8px;background:#f5f7fa;border-radius:10px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#0f1a2e;line-height:1.1;">${stats.today.newUsers}</div>
                <div style="font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-top:4px;">New users</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:14px 8px;background:#f5f7fa;border-radius:10px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#0f1a2e;line-height:1.1;">${stats.ops.dau}</div>
                <div style="font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-top:4px;">Active senders</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:14px 8px;background:#f5f7fa;border-radius:10px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#166534;line-height:1.1;">${stats.today.humanOpens}</div>
                <div style="font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-top:4px;">Opens</div>
              </td>
              <td style="width:6px;"></td>
              <td style="padding:14px 8px;background:#f5f7fa;border-radius:10px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:700;color:#1e40af;line-height:1.1;">${stats.today.clicks}</div>
                <div style="font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-top:4px;">Clicks</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- All-time totals -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">All-time totals</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:14px 16px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Users</div>
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;margin-top:4px;">${stats.totals.users}</div>
              </td>
              <td style="width:8px;"></td>
              <td style="padding:14px 16px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Tracked</div>
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;margin-top:4px;">${stats.totals.emails}</div>
              </td>
              <td style="width:8px;"></td>
              <td style="padding:14px 16px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Events</div>
                <div style="font-size:20px;font-weight:700;color:#0f1a2e;margin-top:4px;">${stats.totals.events}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Engagement insights -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Engagement</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;border-radius:10px;">
            <tr><td style="padding:16px;">
              ${
                stats.engagement.topEmail
                  ? `<div style="margin-bottom:14px;">
                    <p style="margin:0 0 4px;font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Top opened email</p>
                    <p style="margin:0;font-size:13px;color:#0f1a2e;font-weight:600;word-break:break-word;">${escape(stats.engagement.topEmail.subject ?? '(no subject)')}</p>
                    <p style="margin:2px 0 0;font-size:11px;color:#6886b1;">
                      ${escape(stats.engagement.topEmail.sender)} · <strong style="color:#166534;">${stats.engagement.topEmail.opens}</strong> opens
                    </p>
                  </div>`
                  : `<p style="margin:0 0 14px;font-size:13px;color:#9aaecd;">No email opens yet today.</p>`
              }
              ${
                stats.engagement.topCountries.length > 0
                  ? `<div style="margin-bottom:14px;">
                    <p style="margin:0 0 6px;font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Top countries</p>
                    <p style="margin:0;font-size:12px;color:#264168;">
                      ${stats.engagement.topCountries
                        .map(
                          (c) =>
                            `<strong style="color:#0f1a2e;">${escape(c.country)}</strong> ${c.opens}`,
                        )
                        .join(' · ')}
                    </p>
                  </div>`
                  : ''
              }
              <div>
                <p style="margin:0 0 6px;font-size:10px;color:#6886b1;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Device split</p>
                ${deviceBar(stats.engagement.deviceSplit)}
              </div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Tier pills -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Users by tier</p>
          <div style="font-size:0;line-height:0;">${tierPills}</div>
        </td></tr>

        <!-- New signups -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">New signups today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${newUserRows}
          </table>
        </td></tr>

        <!-- Top senders -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Top senders today</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${topSenderRows}
          </table>
        </td></tr>

        <!-- Operations -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:11px;color:#9aaecd;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Operations</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:12px 14px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Active push subs</div>
                <div style="font-size:18px;font-weight:700;color:#0f1a2e;margin-top:4px;">${stats.ops.pushSubs}</div>
              </td>
              <td style="width:8px;"></td>
              <td style="padding:12px 14px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Follow-ups in 24h</div>
                <div style="font-size:18px;font-weight:700;color:${stats.ops.pendingFollowups > 0 ? '#92400e' : '#0f1a2e'};margin-top:4px;">${stats.ops.pendingFollowups}</div>
              </td>
              <td style="width:8px;"></td>
              <td style="padding:12px 14px;border:1px solid #e3e9f2;border-radius:10px;width:33%;">
                <div style="font-size:11px;color:#6886b1;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">DAU</div>
                <div style="font-size:18px;font-weight:700;color:#0f1a2e;margin-top:4px;">${stats.ops.dau}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:32px;text-align:center;">
          <a href="${webUrl}/admin/" style="display:inline-block;background:#3b6cb7;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.01em;box-shadow:0 1px 2px rgba(15,26,46,0.1);">
            Open admin dashboard →
          </a>
        </td></tr>
      </table>

      <p style="margin:18px auto 0;max-width:600px;font-size:11px;color:#9aaecd;text-align:center;line-height:1.5;">
        Admin reports go to every account with <code style="font-family:ui-monospace,'SF Mono',Menlo,monospace;background:#e3e9f2;padding:1px 5px;border-radius:3px;color:#264168;">tier=admin</code>. Promote via D1 if you need to add more.
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

function renderAdminText(stats: AdminStats, webUrl: string): string {
  const trendLine = (today: number, week: number): string => {
    const avg = (week / 7).toFixed(1)
    const arrow = today > week / 7 ? '↑' : today < week / 7 ? '↓' : '→'
    return `${today} today ${arrow} vs ${avg}/d avg`
  }
  const dev = stats.engagement.deviceSplit
  const devTotal = dev.desktop + dev.mobile + dev.other
  const devLine =
    devTotal === 0
      ? 'No opens yet'
      : `${Math.round((dev.desktop / devTotal) * 100)}% desktop, ${Math.round((dev.mobile / devTotal) * 100)}% mobile, ${Math.round((dev.other / devTotal) * 100)}% other`

  return [
    'MailFalcon · admin daily report',
    '',
    'Today:',
    `  New users: ${stats.today.newUsers}`,
    `  Active senders: ${stats.ops.dau}`,
    `  Emails sent: ${stats.today.emailsSent}`,
    `  Opens: ${stats.today.humanOpens} (human) + ${stats.today.opens - stats.today.humanOpens} (bots)`,
    `  Clicks: ${stats.today.clicks}`,
    '',
    'Today vs prior 7d:',
    `  Sent: ${trendLine(stats.today.emailsSent, stats.trend7d.emailsSent)}`,
    `  Opens: ${trendLine(stats.today.humanOpens, stats.trend7d.humanOpens)}`,
    `  Clicks: ${trendLine(stats.today.clicks, stats.trend7d.clicks)}`,
    '',
    'Engagement:',
    stats.engagement.topEmail
      ? `  Top opened: ${stats.engagement.topEmail.subject ?? '(no subject)'} — ${stats.engagement.topEmail.sender} (${stats.engagement.topEmail.opens} opens)`
      : '  Top opened: (no opens yet)',
    stats.engagement.topCountries.length > 0
      ? `  Top countries: ${stats.engagement.topCountries.map((c) => `${c.country} (${c.opens})`).join(', ')}`
      : '  Top countries: —',
    `  Devices: ${devLine}`,
    '',
    'Operations:',
    `  Active push subs: ${stats.ops.pushSubs}`,
    `  Pending follow-ups (24h): ${stats.ops.pendingFollowups}`,
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
        createLogger({ env }).error('admin_digest_send_failed', {
          recipient: admin.email,
          ...errorMeta(err),
        })
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
