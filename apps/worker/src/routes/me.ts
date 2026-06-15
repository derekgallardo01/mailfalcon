import { Hono } from 'hono'
import { z } from 'zod'
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

const patchSchema = z.object({
  digestEnabled: z.boolean().optional(),
})

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
      digestEnabled: users.digestEnabled,
      digestLastSentDay: users.digestLastSentDay,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const usage = await getUsage(c.env.KV, userId)
  return c.json({
    id: row.id,
    email: row.email,
    tier: row.tier,
    createdAt: row.createdAt,
    stripeCustId: row.stripeCustId,
    hasStripeCustomer: !!row.stripeCustId,
    digestEnabled: row.digestEnabled === 1,
    digestLastSentDay: row.digestLastSentDay,
    usage,
  })
})

meRouter.patch('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (parsed.data.digestEnabled !== undefined) {
    updates.digestEnabled = parsed.data.digestEnabled ? 1 : 0
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true })

  await db.update(users).set(updates).where(eq(users.id, userId)).run()
  return c.json({ ok: true })
})
