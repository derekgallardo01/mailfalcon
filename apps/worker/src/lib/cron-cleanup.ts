import { lt } from 'drizzle-orm'
import { notificationSubscriptions } from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger } from './logger'

interface CleanupEnv {
  ENVIRONMENT: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

const STALE_PUSH_SUB_MS = 30 * 86_400_000

/**
 * Delete push subscriptions whose endpoint hasn't been confirmed alive
 * in 30+ days. Web Push providers rotate endpoint URLs over time, and
 * stale rows accumulate (extension upgrade → new SW → new subscription;
 * the prior row hangs around until something reaps it).
 *
 * lastSeenAt is bumped on subscribe + on every successful push delivery,
 * so a real device gets refreshed daily. Anything older than 30 days
 * is almost certainly dead. We also already delete 410-Gone rows
 * proactively in fanoutPush.
 */
export async function cleanupStalePushSubs(
  db: DB,
  env: CleanupEnv,
): Promise<{ deleted: number }> {
  const cutoff = Date.now() - STALE_PUSH_SUB_MS
  const result = await db
    .delete(notificationSubscriptions)
    .where(lt(notificationSubscriptions.lastSeenAt, cutoff))
    .run()
  const deleted = result.meta.changes
  if (deleted > 0) {
    createLogger({ env }).info('cron_push_subs_cleanup', { deleted, cutoff })
  }
  return { deleted }
}
