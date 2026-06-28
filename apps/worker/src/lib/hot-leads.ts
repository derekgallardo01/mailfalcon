import { and, eq, sql } from 'drizzle-orm'
import { hotLeadAlerts, users } from '@mailfalcon/db/schema'
import type { getDb } from './db'
import { createLogger, errorMeta } from './logger'
import { fanoutPush, type PushPayload } from './push-fanout'

type Db = ReturnType<typeof getDb>
type Env = Parameters<typeof fanoutPush>[1]

const DEDUPE_WINDOW_MS = 24 * 3600 * 1000
const EVAL_WINDOW_MS = 24 * 3600 * 1000
const DORMANCY_MS = 14 * 86_400_000

/**
 * Hot-lead evaluator — runs every 15 minutes via cron. For each user
 * with hot_lead_alerts_enabled, looks for contacts that just crossed an
 * engagement threshold and fires a push with kind 'hot-lead'. Dedupes
 * via hot_lead_alerts so a single contact doesn't get re-alerted while
 * still hot.
 *
 * Triggers (any of):
 *   - ≥3 opens within last 24h from the same contact (revisit burst)
 *   - Open + click + reply within last 7d (engagement burst)
 *   - First open after 14d+ silence from this contact (re-engagement)
 */
export async function evaluateHotLeads(
  db: Db,
  env: Env,
): Promise<{ alerts: number; users: number }> {
  const now = Date.now()
  const recentCutoff = now - EVAL_WINDOW_MS
  const dedupeCutoff = now - DEDUPE_WINDOW_MS
  const dormancyCutoff = now - DORMANCY_MS

  // Pull active users — i.e. those with the feature toggled on.
  const targetUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.hotLeadAlertsEnabled, 1))
    .all()

  let totalAlerts = 0
  let touchedUsers = 0

  for (const u of targetUsers) {
    let perUser = 0
    try {
      // Per-contact engagement aggregate for this user.
      const hotContacts = await db.all<{
        hashed_addr: string
        display_label: string | null
        opens_24h: number
        clicks_24h: number
        replies_24h: number
        opens_7d: number
        clicks_7d: number
        replies_7d: number
        last_event_at: number | null
        last_event_at_recent: number | null
      }>(sql`
        SELECT r.hashed_addr AS hashed_addr,
               (SELECT r2.display_label FROM recipients r2
                  INNER JOIN tracked_emails t2 ON t2.id = r2.email_id
                  WHERE r2.hashed_addr = r.hashed_addr AND t2.user_id = ${u.id} AND r2.display_label IS NOT NULL
                  ORDER BY t2.sent_at DESC LIMIT 1) AS display_label,
               SUM(CASE WHEN e.type = 'open'  AND e.ts >= ${recentCutoff} AND e.ua_class != 'bot' THEN 1 ELSE 0 END) AS opens_24h,
               SUM(CASE WHEN e.type = 'click' AND e.ts >= ${recentCutoff} THEN 1 ELSE 0 END) AS clicks_24h,
               SUM(CASE WHEN e.type = 'reply' AND e.ts >= ${recentCutoff} THEN 1 ELSE 0 END) AS replies_24h,
               SUM(CASE WHEN e.type = 'open'  AND e.ts >= ${now - 7 * 86_400_000} AND e.ua_class != 'bot' THEN 1 ELSE 0 END) AS opens_7d,
               SUM(CASE WHEN e.type = 'click' AND e.ts >= ${now - 7 * 86_400_000} THEN 1 ELSE 0 END) AS clicks_7d,
               SUM(CASE WHEN e.type = 'reply' AND e.ts >= ${now - 7 * 86_400_000} THEN 1 ELSE 0 END) AS replies_7d,
               MAX(CASE WHEN e.ts < ${recentCutoff} THEN e.ts ELSE NULL END) AS last_event_at,
               MAX(CASE WHEN e.ts >= ${recentCutoff} THEN e.ts ELSE NULL END) AS last_event_at_recent
        FROM recipients r
        INNER JOIN tracked_emails t ON t.id = r.email_id
        INNER JOIN events e ON e.email_id = t.id AND (e.recipient_id = r.id OR e.recipient_id IS NULL)
        WHERE t.user_id = ${u.id}
        GROUP BY r.hashed_addr
        HAVING last_event_at_recent IS NOT NULL
      `)

      for (const c of hotContacts) {
        const opens24 = Number(c.opens_24h ?? 0)
        const clicks24 = Number(c.clicks_24h ?? 0)
        const replies24 = Number(c.replies_24h ?? 0)
        const opens7d = Number(c.opens_7d ?? 0)
        const clicks7d = Number(c.clicks_7d ?? 0)
        const replies7d = Number(c.replies_7d ?? 0)

        const revisitBurst = opens24 >= 3
        const engagementBurst = opens7d > 0 && clicks7d > 0 && replies7d > 0
        const reengagement =
          c.last_event_at != null &&
          c.last_event_at < dormancyCutoff &&
          c.last_event_at_recent != null &&
          (opens24 > 0 || clicks24 > 0 || replies24 > 0)

        const isHot = revisitBurst || engagementBurst || reengagement
        if (!isHot) continue

        // Dedupe — skip if already alerted on this contact within the
        // window.
        const existing = await db
          .select({ lastAlertedAt: hotLeadAlerts.lastAlertedAt })
          .from(hotLeadAlerts)
          .where(
            and(
              eq(hotLeadAlerts.userId, u.id),
              eq(hotLeadAlerts.hashedAddr, c.hashed_addr),
            ),
          )
          .get()
        if (existing && existing.lastAlertedAt > dedupeCutoff) continue

        const label = c.display_label ?? 'A contact'
        const reasonLabel = revisitBurst
          ? `${opens24} opens in the last 24h`
          : engagementBurst
          ? 'Open + click + reply this week'
          : 'Re-engaged after being dormant'

        const payload: PushPayload = {
          kind: 'hot-lead',
          subject: `🔥 ${label} is hot`,
          text: reasonLabel,
        }

        try {
          await fanoutPush(db, env, u.id, payload)
          await db
            .insert(hotLeadAlerts)
            .values({
              userId: u.id,
              hashedAddr: c.hashed_addr,
              lastAlertedAt: now,
            })
            .onConflictDoUpdate({
              target: [hotLeadAlerts.userId, hotLeadAlerts.hashedAddr],
              set: { lastAlertedAt: now },
            })
            .run()
          perUser++
          totalAlerts++
        } catch (err) {
          createLogger({ env }).warn('hot_lead_push_failed', errorMeta(err))
        }
      }
      if (perUser > 0) touchedUsers++
    } catch (err) {
      createLogger({ env }).warn('hot_lead_eval_per_user_failed', {
        userId: u.id,
        ...errorMeta(err),
      })
    }
  }

  return { alerts: totalAlerts, users: touchedUsers }
}
