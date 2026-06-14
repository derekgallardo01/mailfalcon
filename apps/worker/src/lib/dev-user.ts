import { users } from '@mailfalcon/db/schema'
import { sql } from 'drizzle-orm'
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

// Until auth is wired, every endpoint that needs a userId calls this.
export async function resolveUserId(db: DB, env: { ENVIRONMENT: string }): Promise<string> {
  if (env.ENVIRONMENT === 'development') return ensureDevUser(db)
  throw new Error('auth required')
}

// Suppress unused-import warning if sql ends up unreferenced.
void sql
