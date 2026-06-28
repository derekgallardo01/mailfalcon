import { and, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import type { getDb } from './db'
import { sendActivationReminder, sendWelcomeEmail } from './mailer'

type Db = ReturnType<typeof getDb>
type Env = {
  ENVIRONMENT: string
  RESEND_API_KEY?: string
  PUBLIC_WEB_URL?: string
}

const WELCOME_DELAY_MS = 5 * 60 * 1000
const ACTIVATION_REMINDER_DELAY_MS = 3 * 86_400_000

/**
 * Activation playbook cron. Runs every 10 minutes (the cron registration
 * is in apps/worker/src/index.ts). Two passes:
 *
 *   1. Welcome — fired ~5 minutes after the first /v1/extension/ping.
 *      Sets welcome_email_sent_at so it never re-fires.
 *   2. Activation reminder — fired 3 days after install if the user
 *      still hasn't sent a tracked email.
 *
 * Idempotent at the row level: the WHERE clause requires the
 * corresponding *_sent_at column to be null, so a re-run after a
 * partial failure picks up the un-sent rows on the next pass.
 */
export async function sendActivationEmails(
  db: Db,
  env: Env,
): Promise<{ welcome: number; reminder: number }> {
  const webUrl = env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'
  const now = Date.now()

  // Pass 1 — welcome.
  const welcomeCandidates = await db
    .select({
      id: users.id,
      email: users.email,
      trialEndsAt: users.trialEndsAt,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.installedAt),
        isNull(users.welcomeEmailSentAt),
        lt(users.installedAt, now - WELCOME_DELAY_MS),
      ),
    )
    .all()

  let welcomeSent = 0
  for (const u of welcomeCandidates) {
    const trialDays = u.trialEndsAt
      ? Math.max(0, Math.ceil((u.trialEndsAt - now) / 86_400_000))
      : 0
    try {
      await sendWelcomeEmail({
        to: u.email,
        trialDaysRemaining: trialDays,
        webUrl,
        env,
      })
      await db
        .update(users)
        .set({ welcomeEmailSentAt: now })
        .where(sql`${users.id} = ${u.id}`)
        .run()
      welcomeSent++
    } catch (err) {
      console.warn(`[mailfalcon] welcome send failed for ${u.email}:`, err)
    }
  }

  // Pass 2 — 3-day activation reminder for users still without a send.
  const reminderCandidates = await db
    .select({
      id: users.id,
      email: users.email,
      trialEndsAt: users.trialEndsAt,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.installedAt),
        isNull(users.firstSendAt),
        isNull(users.activationEmailSentAt),
        lt(users.installedAt, now - ACTIVATION_REMINDER_DELAY_MS),
      ),
    )
    .all()

  let reminderSent = 0
  for (const u of reminderCandidates) {
    const trialDays = u.trialEndsAt
      ? Math.max(0, Math.ceil((u.trialEndsAt - now) / 86_400_000))
      : 0
    try {
      await sendActivationReminder({
        to: u.email,
        trialDaysRemaining: trialDays,
        webUrl,
        env,
      })
      await db
        .update(users)
        .set({ activationEmailSentAt: now })
        .where(sql`${users.id} = ${u.id}`)
        .run()
      reminderSent++
    } catch (err) {
      console.warn(`[mailfalcon] activation reminder send failed for ${u.email}:`, err)
    }
  }

  return { welcome: welcomeSent, reminder: reminderSent }
}
