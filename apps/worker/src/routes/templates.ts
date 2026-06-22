import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  templates,
  workspaceMembers,
  workspaces,
} from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { memberRole } from '../lib/workspace'

const upsertSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().max(500).default(''),
  bodyHtml: z.string().max(50_000),
  /** Optional workspace to share with. Caller must be a member of it.
   *  null/omitted = personal template. */
  workspaceId: z.string().min(1).max(60).nullable().optional(),
})

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const templatesRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/** GET /v1/templates — returns the caller's personal templates plus
 *  every workspace template they have access to via membership. */
templatesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Subquery: workspace ids the caller is a member of.
  const memberWorkspaceIds = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .all()
  const wsIds = memberWorkspaceIds.map((r) => r.workspaceId)

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      subject: templates.subject,
      bodyHtml: templates.bodyHtml,
      createdAt: templates.createdAt,
      workspaceId: templates.workspaceId,
      workspaceName: workspaces.name,
      creatorUserId: templates.userId,
    })
    .from(templates)
    .leftJoin(workspaces, eq(workspaces.id, templates.workspaceId))
    .where(
      wsIds.length > 0
        ? or(
            and(eq(templates.userId, userId), isNull(templates.workspaceId)),
            inArray(templates.workspaceId, wsIds),
          )
        : and(eq(templates.userId, userId), isNull(templates.workspaceId)),
    )
    .orderBy(desc(templates.createdAt))
    .all()

  return c.json({
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      bodyHtml: r.bodyHtml,
      createdAt: r.createdAt,
      scope: r.workspaceId == null ? 'personal' : 'workspace',
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      creatorUserId: r.creatorUserId,
    })),
  })
})

templatesRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Validate workspace membership if sharing.
  if (parsed.data.workspaceId) {
    const role = await memberRole(db, userId, parsed.data.workspaceId)
    if (!role) return c.json({ error: 'forbidden_workspace' }, 403)
  }

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
      workspaceId: parsed.data.workspaceId ?? null,
    })
    .run()
  return c.json({ id })
})

/**
 * PUT /v1/templates/:id — edit semantics:
 *   - Personal template: only the creator can edit (userId match).
 *   - Workspace template: the workspace owner can edit any; non-owner
 *     members can edit only templates THEY created. workspaceId can be
 *     changed only if the caller can edit the existing AND has access
 *     to the target workspace.
 */
templatesRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const existing = await db
    .select({ userId: templates.userId, workspaceId: templates.workspaceId })
    .from(templates)
    .where(eq(templates.id, id))
    .get()
  if (!existing) return c.json({ error: 'not_found' }, 404)

  const canEdit = await callerCanEdit(db, userId, existing)
  if (!canEdit) return c.json({ error: 'forbidden' }, 403)

  // Re-scoping requires access to the target workspace too.
  if (parsed.data.workspaceId) {
    const role = await memberRole(db, userId, parsed.data.workspaceId)
    if (!role) return c.json({ error: 'forbidden_workspace' }, 403)
  }

  await db
    .update(templates)
    .set({
      name: parsed.data.name,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      workspaceId: parsed.data.workspaceId ?? null,
    })
    .where(eq(templates.id, id))
    .run()
  return c.json({ ok: true })
})

templatesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const existing = await db
    .select({ userId: templates.userId, workspaceId: templates.workspaceId })
    .from(templates)
    .where(eq(templates.id, id))
    .get()
  if (!existing) return c.json({ error: 'not_found' }, 404)
  const canEdit = await callerCanEdit(db, userId, existing)
  if (!canEdit) return c.json({ error: 'forbidden' }, 403)
  await db.delete(templates).where(eq(templates.id, id)).run()
  return c.json({ ok: true })
})

async function callerCanEdit(
  db: ReturnType<typeof getDb>,
  userId: string,
  existing: { userId: string; workspaceId: string | null },
): Promise<boolean> {
  // Personal templates: only the creator edits.
  if (!existing.workspaceId) return existing.userId === userId
  // Workspace templates: creator OR workspace owner.
  if (existing.userId === userId) return true
  const role = await memberRole(db, userId, existing.workspaceId)
  return role === 'owner'
}
