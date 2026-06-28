import { and, eq, inArray } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import type { DB } from './db'
import {
  computeStatsForUser,
  renderDigestHtml,
  renderDigestText,
  sendDigestViaResend,
} from './digest'
import { createLogger, errorMeta } from './logger'
import { isInQuietHours } from './quiet-hours'

interface MiddayDigestEnv {
  ENVIRONMENT: string
  RESEND_API_KEY?: string
  PUBLIC_WEB_URL?: string
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Mid-day digest — fires at 17:00 UTC (1pm ET) to catch activity the
 * nightly 22:00 digest hasn't seen yet. Same gating as nightly (Pro
 * tier + digestEnabled) plus the new midday_digest_enabled toggle.
 *
 * Window: last 12 hours of events. Dedup via the new
 * digest_last_sent_slot column — fires once per (day, slot), so a
 * retry of the same cron doesn't double-send.
 *
 * Quiet hours: respects per-user quiet-hours window. A user in Asia
 * who set 21:00-08:00 PT gets their midday digest skipped if 17:00 UTC
 * lands in their quiet window.
 */
export async function sendMiddayDigests(
  db: DB,
  env: MiddayDigestEnv,
): Promise<{
  considered: number
  skippedQuiet: number
  skippedAlreadySent: number
  skippedNoActivity: number
  sent: number
  failed: number
}> {
  const today = todayKey()
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'

  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      digestLastSentDay: users.digestLastSentDay,
      digestLastSentSlot: users.digestLastSentSlot,
      quietStartMinute: users.quietStartMinute,
      quietEndMinute: users.quietEndMinute,
      quietTimezone: users.quietTimezone,
    })
    .from(users)
    .where(
      and(
        eq(users.digestEnabled, 1),
        eq(users.middayDigestEnabled, 1),
        inArray(users.tier, ['pro', 'team', 'admin']),
      ),
    )
    .all()

  let considered = 0
  let skippedQuiet = 0
  let skippedAlreadySent = 0
  let skippedNoActivity = 0
  let sent = 0
  let failed = 0

  for (const u of candidates) {
    considered++
    if (u.digestLastSentDay === today && u.digestLastSentSlot === 'midday') {
      skippedAlreadySent++
      continue
    }
    if (isInQuietHours(u)) {
      skippedQuiet++
      continue
    }
    // 12h window — half-day catch-up since the morning.
    const stats = await computeStatsForUser(db, u.id, 12 * 3600 * 1000)
    if (stats.emailsSent === 0 && stats.opens === 0 && stats.clicks === 0) {
      // Mark slot so the cron doesn't re-eval every 5 minutes.
      await db
        .update(users)
        .set({ digestLastSentDay: today, digestLastSentSlot: 'midday' })
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
        .set({ digestLastSentDay: today, digestLastSentSlot: 'midday' })
        .where(eq(users.id, u.id))
        .run()
      sent++
    } catch (err) {
      createLogger({ env }).error('midday_digest_send_failed', {
        recipient: u.email,
        ...errorMeta(err),
      })
      failed++
    }
  }

  return {
    considered,
    skippedQuiet,
    skippedAlreadySent,
    skippedNoActivity,
    sent,
    failed,
  }
}
