import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, eq } from 'drizzle-orm'
import { followUps, trackedEmails } from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

const createSchema = z.object({
  emailId: z.string().min(1).max(64),
  remindAfterDays: z.number().int().min(1).max(60),
  condition: z.enum(['no_open', 'no_reply', 'always']).default('no_open'),
})

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const followupsRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

followupsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const rows = await db
    .select({
      id: followUps.id,
      emailId: followUps.emailId,
      remindAt: followUps.remindAt,
      condition: followUps.condition,
      fired: followUps.fired,
      subject: trackedEmails.subject,
    })
    .from(followUps)
    .innerJoin(trackedEmails, eq(followUps.emailId, trackedEmails.id))
    .where(eq(followUps.userId, userId))
    .orderBy(asc(followUps.remindAt))
    .all()
  return c.json({
    followups: rows.map((r) => ({
      id: r.id,
      emailId: r.emailId,
      subject: r.subject,
      remindAt: r.remindAt,
      condition: r.condition,
      fired: r.fired === 1,
    })),
  })
})

followupsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Ensure the email belongs to the caller; pulls the sent timestamp so
  // the reminder fires N days after send, not N days from now.
  const email = await db
    .select({ id: trackedEmails.id, sentAt: trackedEmails.sentAt })
    .from(trackedEmails)
    .where(
      and(
        eq(trackedEmails.id, parsed.data.emailId),
        eq(trackedEmails.userId, userId),
      ),
    )
    .get()
  if (!email) return c.json({ error: 'email_not_found' }, 404)

  const id = `fu_${newTrackingId()}`
  const remindAt = email.sentAt + parsed.data.remindAfterDays * 86_400_000

  await db
    .insert(followUps)
    .values({
      id,
      userId,
      emailId: email.id,
      remindAt,
      condition: parsed.data.condition,
      fired: 0,
    })
    .run()
  return c.json({ id, remindAt })
})

followupsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const result = await db
    .delete(followUps)
    .where(and(eq(followUps.id, id), eq(followUps.userId, userId)))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
