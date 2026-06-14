import { users } from '@mailfalcon/db/schema'
import type { DB } from './db'

export const DEV_USER_ID = 'dev-user'

export async function ensureDevUser(db: DB): Promise<string> {
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: 'dev@mailfalcon.app',
      createdAt: Date.now(),
      tier: 'free',
    })
    .onConflictDoNothing()
    .run()
  return DEV_USER_ID
}
