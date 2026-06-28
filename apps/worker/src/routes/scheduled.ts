import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { scheduledSends } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

const STATUSES = ['queued', 'fired', 'failed', 'cancelled', 'snoozed'] as const
type ScheduledStatus = (typeof STATUSES)[number]

const ID_PATTERN = /^sch_[A-Za-z0-9_-]{8,64}$/

const createSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  scheduledAt: z.number().int().nonnegative(),
  to: z.array(z.string().max(320)).max(50),
  cc: z.array(z.string().max(320)).max(50).default([]),
  bcc: z.array(z.string().max(320)).max(50).default([]),
  subject: z.string().max(998).default(''),
  bodyPreview: z.string().max(400).optional(),
})

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  firedEmailId: z.string().max(120).nullable().optional(),
  failureReason: z.string().max(500).nullable().optional(),
})

export const scheduledRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * GET /v1/scheduled — caller's queue + history. Optional ?status=
 * comma-separated filter; default returns everything sorted by
 * scheduledAt DESC so upcoming + recent history live in one view.
 */
scheduledRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const statusParam = c.req.query('status')
  const wanted = statusParam
    ? (statusParam
        .split(',')
        .filter((s) => (STATUSES as readonly string[]).includes(s)) as ScheduledStatus[])
    : null

  const rows = await db
    .select()
    .from(scheduledSends)
    .where(
      wanted && wanted.length > 0
        ? and(
            eq(scheduledSends.userId, userId),
            inArray(scheduledSends.status, wanted),
          )
        : eq(scheduledSends.userId, userId),
    )
    .orderBy(desc(scheduledSends.scheduledAt))
    .all()

  return c.json({
    scheduled: rows.map((r) => ({
      id: r.id,
      scheduledAt: r.scheduledAt,
      to: safeJsonArray(r.toAddresses),
      cc: safeJsonArray(r.ccAddresses),
      bcc: safeJsonArray(r.bccAddresses),
      subject: r.subject,
      bodyPreview: r.bodyPreview,
      status: r.status,
      firedAt: r.firedAt,
      firedEmailId: r.firedEmailId,
      failureReason: r.failureReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  })
})

/**
 * POST /v1/scheduled — the extension mirrors a freshly-scheduled send.
 * Idempotent on `id` (the extension's `sch_xxx` UUID); a re-POST with
 * the same id is a no-op success so retries don't dupe.
 */
scheduledRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const now = Date.now()

  const existing = await db
    .select({ id: scheduledSends.id, userId: scheduledSends.userId })
    .from(scheduledSends)
    .where(eq(scheduledSends.id, parsed.data.id))
    .get()
  if (existing) {
    if (existing.userId !== userId) return c.json({ error: 'forbidden' }, 403)
    return c.json({ ok: true, deduped: true })
  }

  await db
    .insert(scheduledSends)
    .values({
      id: parsed.data.id,
      userId,
      scheduledAt: parsed.data.scheduledAt,
      toAddresses: JSON.stringify(parsed.data.to),
      ccAddresses: JSON.stringify(parsed.data.cc),
      bccAddresses: JSON.stringify(parsed.data.bcc),
      subject: parsed.data.subject,
      bodyPreview: parsed.data.bodyPreview ?? null,
      status: 'queued',
      firedAt: null,
      firedEmailId: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return c.json({ ok: true })
})

/**
 * PATCH /v1/scheduled/:id — extension reports a status transition
 * (queued→fired / queued→snoozed / queued→failed). Always bumps
 * `updated_at`. Owner-scoped; 404 if the row belongs to someone else.
 */
scheduledRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  if (!ID_PATTERN.test(id)) return c.json({ error: 'invalid_id' }, 400)
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({ userId: scheduledSends.userId })
    .from(scheduledSends)
    .where(eq(scheduledSends.id, id))
    .get()
  if (!row || row.userId !== userId) return c.json({ error: 'not_found' }, 404)

  const now = Date.now()
  const updates: Record<string, unknown> = { updatedAt: now }
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
    if (parsed.data.status === 'fired') updates.firedAt = now
  }
  if (parsed.data.firedEmailId !== undefined) updates.firedEmailId = parsed.data.firedEmailId
  if (parsed.data.failureReason !== undefined) updates.failureReason = parsed.data.failureReason

  await db.update(scheduledSends).set(updates).where(eq(scheduledSends.id, id)).run()
  return c.json({ ok: true })
})

/**
 * DELETE /v1/scheduled/:id — soft-cancel. We mark status=cancelled
 * rather than removing the row so the user can see the history of what
 * they aborted. The extension still has to cancel its chrome.alarm
 * separately; v1 limitation documented in the dashboard UI.
 */
scheduledRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!ID_PATTERN.test(id)) return c.json({ error: 'invalid_id' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({ userId: scheduledSends.userId, status: scheduledSends.status })
    .from(scheduledSends)
    .where(eq(scheduledSends.id, id))
    .get()
  if (!row || row.userId !== userId) return c.json({ error: 'not_found' }, 404)
  // Already terminal — no-op.
  if (row.status === 'fired' || row.status === 'cancelled' || row.status === 'failed') {
    return c.json({ ok: true, status: row.status })
  }

  await db
    .update(scheduledSends)
    .set({ status: 'cancelled', updatedAt: Date.now() })
    .where(eq(scheduledSends.id, id))
    .run()
  return c.json({ ok: true })
})

function safeJsonArray(s: string | null): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
