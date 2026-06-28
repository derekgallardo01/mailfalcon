import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { eventWebhooks } from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

const URL_PATTERN = /^https:\/\/(hooks\.slack\.com|discord\.com|discordapp\.com)\//

const createSchema = z.object({
  url: z
    .string()
    .url()
    .max(500)
    .refine(
      (v) => URL_PATTERN.test(v),
      'must be a Slack or Discord webhook URL',
    ),
  notifyOpen: z.boolean().default(true),
  notifyClick: z.boolean().default(true),
  notifyReply: z.boolean().default(true),
  notifyHotLead: z.boolean().default(true),
})

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  notifyOpen: z.boolean().optional(),
  notifyClick: z.boolean().optional(),
  notifyReply: z.boolean().optional(),
  notifyHotLead: z.boolean().optional(),
})

export const webhooksRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

webhooksRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(eventWebhooks)
    .where(eq(eventWebhooks.userId, userId))
    .orderBy(desc(eventWebhooks.createdAt))
    .all()
  return c.json({
    webhooks: rows.map((r) => ({
      id: r.id,
      url: r.url,
      enabled: r.enabled === 1,
      notifyOpen: r.notifyOpen === 1,
      notifyClick: r.notifyClick === 1,
      notifyReply: r.notifyReply === 1,
      notifyHotLead: r.notifyHotLead === 1,
      createdAt: r.createdAt,
      lastFiredAt: r.lastFiredAt,
      lastStatus: r.lastStatus,
    })),
  })
})

webhooksRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const id = `whk_${newTrackingId()}`
  await db
    .insert(eventWebhooks)
    .values({
      id,
      userId,
      url: parsed.data.url,
      notifyOpen: parsed.data.notifyOpen ? 1 : 0,
      notifyClick: parsed.data.notifyClick ? 1 : 0,
      notifyReply: parsed.data.notifyReply ? 1 : 0,
      notifyHotLead: parsed.data.notifyHotLead ? 1 : 0,
      enabled: 1,
      createdAt: Date.now(),
    })
    .run()
  return c.json({ id })
})

webhooksRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled ? 1 : 0
  if (parsed.data.notifyOpen !== undefined)
    updates.notifyOpen = parsed.data.notifyOpen ? 1 : 0
  if (parsed.data.notifyClick !== undefined)
    updates.notifyClick = parsed.data.notifyClick ? 1 : 0
  if (parsed.data.notifyReply !== undefined)
    updates.notifyReply = parsed.data.notifyReply ? 1 : 0
  if (parsed.data.notifyHotLead !== undefined)
    updates.notifyHotLead = parsed.data.notifyHotLead ? 1 : 0
  if (Object.keys(updates).length === 0) return c.json({ ok: true })
  const result = await db
    .update(eventWebhooks)
    .set(updates)
    .where(and(eq(eventWebhooks.id, id), eq(eventWebhooks.userId, userId)))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

webhooksRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const result = await db
    .delete(eventWebhooks)
    .where(and(eq(eventWebhooks.id, id), eq(eventWebhooks.userId, userId)))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

/** Fires a synthetic event to the webhook so the user can verify wiring. */
webhooksRouter.post('/:id/test', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({ url: eventWebhooks.url })
    .from(eventWebhooks)
    .where(and(eq(eventWebhooks.id, id), eq(eventWebhooks.userId, userId)))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const isDiscord = row.url.includes('discord.com/api/webhooks')
  const text =
    '🦅 Test from MailFalcon — if you see this, your webhook is wired correctly.'
  const body = isDiscord ? { content: text } : { text }
  const res = await fetch(row.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await db
    .update(eventWebhooks)
    .set({ lastFiredAt: Date.now(), lastStatus: String(res.status) })
    .where(eq(eventWebhooks.id, id))
    .run()
  if (!res.ok) {
    return c.json({ error: 'webhook_rejected', status: res.status }, 400)
  }
  return c.json({ ok: true })
})
