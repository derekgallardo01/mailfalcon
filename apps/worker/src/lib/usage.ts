const FREE_DAILY_CAP = 10

function todayKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return `usage:${userId}:${day}`
}

export interface UsageCheck {
  allowed: boolean
  used: number
  limit: number
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
  const current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0

  if (current >= FREE_DAILY_CAP) {
    return { allowed: false, used: current, limit: FREE_DAILY_CAP }
  }

  // KV is eventually consistent — at the freemium boundary a couple of
  // racing requests may slip through. Acceptable for an MVP.
  await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 })
  return { allowed: true, used: current + 1, limit: FREE_DAILY_CAP }
}

export async function getUsage(
  kv: KVNamespace,
  userId: string,
): Promise<{ used: number; limit: number }> {
  const key = todayKey(userId)
  const current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0
  return { used: current, limit: FREE_DAILY_CAP }
}
