interface Bucket {
  count: number
  windowStart: number
}

/**
 * KV-backed fixed-window counter. Returns `{ allowed, remaining }` and
 * commits the new count if `allowed`. Eventually consistent: KV reads
 * can be ~60s stale globally, so for hard cost-control (billing) prefer
 * a Durable Object. For abuse hardening this is fine.
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Math.floor(Date.now() / 1000)
  const existing = (await kv.get(key, 'json')) as Bucket | null

  let bucket: Bucket
  if (existing && now - existing.windowStart < windowSec) {
    bucket = existing
  } else {
    bucket = { count: 0, windowStart: now }
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  bucket.count++
  await kv.put(key, JSON.stringify(bucket), {
    expirationTtl: windowSec,
  })
  return { allowed: true, remaining: limit - bucket.count }
}

/**
 * Simple atomic incr/decr for tracking concurrent counts (e.g. SSE
 * connections per user). No window — caller is responsible for
 * decrement on disconnect.
 */
export async function concurrentInc(
  kv: KVNamespace,
  key: string,
  ttlSec: number,
): Promise<number> {
  const raw = await kv.get(key)
  const cur = raw ? Number.parseInt(raw, 10) : 0
  const next = cur + 1
  await kv.put(key, String(next), { expirationTtl: ttlSec })
  return next
}

export async function concurrentDec(
  kv: KVNamespace,
  key: string,
  ttlSec: number,
): Promise<void> {
  const raw = await kv.get(key)
  const cur = raw ? Number.parseInt(raw, 10) : 0
  const next = Math.max(0, cur - 1)
  if (next === 0) {
    await kv.delete(key)
  } else {
    await kv.put(key, String(next), { expirationTtl: ttlSec })
  }
}
