/**
 * KV index of active session jtis per user. Needed because KV has no
 * scan/prefix API at the cost we want, so without this index, deleting
 * a user's account can't invalidate their JWTs — they'd live until
 * natural expiry.
 *
 * Race note: two concurrent sign-ins for the same user can drop one
 * entry. The underlying session:{jti} key still works for auth (the
 * 30d TTL is independent), so the only consequence is delete won't
 * sweep that one. Capped at 20 entries — older ones are evicted to keep
 * the index bounded.
 */

const INDEX_TTL_SEC = 30 * 24 * 3600
const MAX_INDEX_SIZE = 20

function indexKey(userId: string): string {
  return `sessions-by-user:${userId}`
}

async function readIndex(kv: KVNamespace, userId: string): Promise<string[]> {
  const raw = (await kv.get(indexKey(userId), 'json')) as string[] | null
  return Array.isArray(raw) ? raw : []
}

export async function addSession(
  kv: KVNamespace,
  userId: string,
  jti: string,
): Promise<void> {
  const cur = await readIndex(kv, userId)
  if (cur.includes(jti)) return
  const next = [...cur, jti]
  const trimmed =
    next.length > MAX_INDEX_SIZE ? next.slice(-MAX_INDEX_SIZE) : next
  await kv.put(indexKey(userId), JSON.stringify(trimmed), {
    expirationTtl: INDEX_TTL_SEC,
  })
}

export async function removeSession(
  kv: KVNamespace,
  userId: string,
  jti: string,
): Promise<void> {
  const cur = await readIndex(kv, userId)
  const next = cur.filter((x) => x !== jti)
  if (next.length === cur.length) return
  if (next.length === 0) {
    await kv.delete(indexKey(userId))
  } else {
    await kv.put(indexKey(userId), JSON.stringify(next), {
      expirationTtl: INDEX_TTL_SEC,
    })
  }
}

/** Deletes every session:{jti} key in the user's index, then clears the index. */
export async function sweepUserSessions(
  kv: KVNamespace,
  userId: string,
): Promise<number> {
  const cur = await readIndex(kv, userId)
  await Promise.all(cur.map((jti) => kv.delete(`session:${jti}`)))
  await kv.delete(indexKey(userId))
  return cur.length
}
