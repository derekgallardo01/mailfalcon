import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { templates } from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

const upsertSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().max(500).default(''),
  bodyHtml: z.string().max(50_000),
})

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const templatesRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

templatesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.createdAt))
    .all()
  return c.json({
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      bodyHtml: r.bodyHtml,
      createdAt: r.createdAt,
    })),
  })
})

templatesRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const id = `tpl_${newTrackingId()}`
  await db
    .insert(templates)
    .values({
      id,
      userId,
      name: parsed.data.name,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      createdAt: Date.now(),
    })
    .run()
  return c.json({ id })
})

templatesRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const result = await db
    .update(templates)
    .set({
      name: parsed.data.name,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
    })
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

templatesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const result = await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
