import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getUsage } from '../lib/usage'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  KV: KVNamespace
}

export const meRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

meRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      createdAt: users.createdAt,
      stripeCustId: users.stripeCustId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const usage = await getUsage(c.env.KV, userId)
  return c.json({
    ...row,
    hasStripeCustomer: !!row.stripeCustId,
    usage,
  })
})
