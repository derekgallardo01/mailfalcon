import { eq } from 'drizzle-orm'
import { notificationSubscriptions, users } from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'
import { isInQuietHours } from './quiet-hours'
import { sendPushEmpty } from './web-push'

interface PushEnv {
  ENVIRONMENT: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

/**
 * Fan out an empty Web Push to every subscription the user has. Prunes
 * subscriptions that come back gone (404/410). Errors are swallowed —
 * pushes are best-effort; the SSE stream and the dashboard refetch keep
 * the UI correct even when push delivery flakes.
 */
export async function fanoutPush(
  db: DB,
  env: PushEnv,
  userId: string,
): Promise<{ sent: number; pruned: number; suppressed?: 'quiet_hours' }> {
  // Quiet hours: a single users-row read, then short-circuit if inside
  // the window. Saves the subs query + every push round-trip.
  const user = await db
    .select({
      quietStartMinute: users.quietStartMinute,
      quietEndMinute: users.quietEndMinute,
      quietTimezone: users.quietTimezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (user && isInQuietHours(user)) {
    return { sent: 0, pruned: 0, suppressed: 'quiet_hours' }
  }

  const subs = await db
    .select({
      id: notificationSubscriptions.id,
      endpoint: notificationSubscriptions.endpoint,
      p256dh: notificationSubscriptions.p256dh,
      auth: notificationSubscriptions.auth,
    })
    .from(notificationSubscriptions)
    .where(eq(notificationSubscriptions.userId, userId))
    .all()

  if (subs.length === 0) return { sent: 0, pruned: 0 }

  let sent = 0
  let pruned = 0

  const now = Date.now()
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const result = await sendPushEmpty(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          env,
        )
        if (result.ok) {
          sent++
          // Mark the endpoint as alive so the stale-sub cron leaves it
          // alone. Fire-and-forget — push fan-out already runs inside
          // c.executionCtx.waitUntil.
          await db
            .update(notificationSubscriptions)
            .set({ lastSeenAt: now })
            .where(eq(notificationSubscriptions.id, sub.id))
            .run()
        }
        if (result.gone) {
          await db
            .delete(notificationSubscriptions)
            .where(eq(notificationSubscriptions.id, sub.id))
            .run()
          pruned++
        }
      } catch (err) {
        createLogger({ env }).warn('push_fanout_error', errorMeta(err))
      }
    }),
  )

  return { sent, pruned }
}
