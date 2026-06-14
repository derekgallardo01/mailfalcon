import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { users } from '@mailfalcon/db/schema'
import type { Variables } from './auth-middleware'
import { getDb } from './db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const adminMiddleware: MiddlewareHandler<{
  Bindings: Bindings
  Variables: Variables
}> = async (c, next) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const db = getDb(c.env.DB)
  const row = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!row || row.tier !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }
  return next()
}
