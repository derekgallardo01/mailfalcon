import { users } from '@mailfalcon/db/schema'
import type { DB } from './db'

export const DEV_USER_ID = 'dev-user'

// In dev we always want the dev-user row to exist and to be an admin so the
// /admin endpoints + page are reachable without a real promotion step.
export async function ensureDevUser(db: DB): Promise<string> {
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: 'dev@mailfalcon.app',
      createdAt: Date.now(),
      tier: 'admin',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { tier: 'admin' },
    })
    .run()
  return DEV_USER_ID
}
