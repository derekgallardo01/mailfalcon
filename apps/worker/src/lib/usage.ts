import { and, count, eq, gte } from 'drizzle-orm'
import { trackedEmails } from '@mailfalcon/db/schema'
import type { DB } from './db'

export const FREE_DAILY_CAP = 10

export function getStartOfDayUtc(nowMs: number = Date.now()): number {
  const d = new Date(nowMs)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

function todayKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return `usage:${userId}:${day}`
}

export interface UsageCheck {
  allowed: boolean
  used: number
  limit: number
}

/**
 * Checks and enforces daily quota against Cloudflare D1 (SQL).
 * D1 free tier gives 100,000 writes/day & 5,000,000 reads/day.
 * By querying tracked_emails (indexed on (userId, sentAt)),
 * this requires ZERO KV writes, zero KV reads, and is 100% accurate.
 */
export async function checkDbUsage(
  db: DB,
  userId: string,
  tier: 'free' | 'pro' | 'team' | 'admin',
  nowMs: number = Date.now(),
): Promise<UsageCheck> {
  if (tier !== 'free') {
    return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY }
  }

  const { used, limit } = await getDbUsage(db, userId, nowMs)
  if (used >= limit) {
    return { allowed: false, used, limit }
  }

  return { allowed: true, used: used + 1, limit }
}

export async function getDbUsage(
  db: DB,
  userId: string,
  nowMs: number = Date.now(),
): Promise<{ used: number; limit: number }> {
  const startOfDay = getStartOfDayUtc(nowMs)
  const res = await db
    .select({ count: count() })
    .from(trackedEmails)
    .where(
      and(
        eq(trackedEmails.userId, userId),
        gte(trackedEmails.sentAt, startOfDay),
      ),
    )
    .get()

  const used = res?.count ?? 0
  return { used, limit: FREE_DAILY_CAP }
}

export async function checkAndIncrementUsage(
  kv: KVNamespace,
  userId: string,
  tier: 'free' | 'pro' | 'team' | 'admin',
): Promise<UsageCheck> {
  if (tier !== 'free') {
    return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY }
  }

  const key = todayKey(userId)
  let current = 0
  try {
    current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0
  } catch {
    return { allowed: true, used: 0, limit: FREE_DAILY_CAP }
  }

  if (current >= FREE_DAILY_CAP) {
    return { allowed: false, used: current, limit: FREE_DAILY_CAP }
  }

  // Fail open if KV write quota is exceeded (429) so users aren't blocked from sending
  try {
    await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 })
  } catch {
    return { allowed: true, used: current + 1, limit: FREE_DAILY_CAP }
  }
  return { allowed: true, used: current + 1, limit: FREE_DAILY_CAP }
}

export async function getUsage(
  kv: KVNamespace,
  userId: string,
): Promise<{ used: number; limit: number }> {
  const key = todayKey(userId)
  try {
    const current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0
    return { used: current, limit: FREE_DAILY_CAP }
  } catch {
    return { used: 0, limit: FREE_DAILY_CAP }
  }
}
