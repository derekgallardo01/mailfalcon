import { and, count, eq, lte, sql } from 'drizzle-orm'
import {
  events,
  followUps,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'
import { sendFollowupReminder } from './mailer'

interface FollowupEnv {
  ENVIRONMENT: string
  PUBLIC_WEB_URL?: string
  RESEND_API_KEY?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

/**
 * Cron job: scan all follow-ups that are due (remind_at <= now,
 * fired = 0). For each, check whether the condition is satisfied
 * (no_open / no_reply / always), send the reminder, mark fired = 1.
 *
 * Only the no_open condition is implemented today. no_reply would need
 * Gmail inbox introspection which we don't have. always fires on every
 * due row regardless of opens.
 */
export async function evaluateFollowups(
  db: DB,
  env: FollowupEnv,
): Promise<{ considered: number; sent: number; failed: number }> {
  const log = createLogger({ env })
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'
  const now = Date.now()

  const due = await db
    .select({
      id: followUps.id,
      userId: followUps.userId,
      emailId: followUps.emailId,
      condition: followUps.condition,
      subject: trackedEmails.subject,
      sentAt: trackedEmails.sentAt,
      userEmail: users.email,
    })
    .from(followUps)
    .innerJoin(trackedEmails, eq(followUps.emailId, trackedEmails.id))
    .innerJoin(users, eq(followUps.userId, users.id))
    .where(
      and(eq(followUps.fired, 0), lte(followUps.remindAt, now)),
    )
    .limit(200)
    .all()

  let sent = 0
  let failed = 0

  for (const f of due) {
    let shouldFire = false
    if (f.condition === 'always') {
      shouldFire = true
    } else if (f.condition === 'no_open') {
      const openCount = await db
        .select({ n: count() })
        .from(events)
        .where(
          and(
            eq(events.emailId, f.emailId),
            eq(events.type, 'open'),
            sql`${events.uaClass} != 'bot'`,
          ),
        )
        .get()
      shouldFire = (openCount?.n ?? 0) === 0
    } else {
      // no_reply needs inbox introspection; skip for now and clear it.
      shouldFire = false
    }

    if (shouldFire) {
      try {
        await sendFollowupReminder({
          to: f.userEmail,
          subject: f.subject,
          emailId: f.emailId,
          sentAt: f.sentAt,
          webUrl,
          env,
        })
        sent++
      } catch (err) {
        log.error('followup_send_failed', {
          followupId: f.id,
          ...errorMeta(err),
        })
        failed++
      }
    }

    // Always mark fired, even if we chose not to send — otherwise we'd
    // re-scan the same row on every cron tick.
    await db
      .update(followUps)
      .set({ fired: 1 })
      .where(eq(followUps.id, f.id))
      .run()
  }

  return { considered: due.length, sent, failed }
}
