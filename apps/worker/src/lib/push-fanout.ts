import { eq } from 'drizzle-orm'
import { notificationSubscriptions } from '@mailfalcon/db/schema'
import type { DB } from './db'
import { sendPushEmpty } from './web-push'

interface PushEnv {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
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
): Promise<{ sent: number; pruned: number }> {
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

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const result = await sendPushEmpty(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          env,
        )
        if (result.ok) sent++
        if (result.gone) {
          await db
            .delete(notificationSubscriptions)
            .where(eq(notificationSubscriptions.id, sub.id))
            .run()
          pruned++
        }
      } catch (err) {
        console.warn('[mailfalcon] push fanout error:', err)
      }
    }),
  )

  return { sent, pruned }
}
