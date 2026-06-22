import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import {
  users,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from '@mailfalcon/db/schema'
import { newTrackingId } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { createLogger, errorMeta } from '../lib/logger'
import { sendWorkspaceInvite } from '../lib/mailer'
import { isMember, memberRole } from '../lib/workspace'

type Bindings = {
  ENVIRONMENT: string
  RESEND_API_KEY?: string
  PUBLIC_WEB_URL?: string
  DB: D1Database
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000

const createSchema = z.object({
  name: z.string().min(1).max(60).transform((s) => s.trim()),
})

const renameSchema = z.object({
  name: z.string().min(1).max(60).transform((s) => s.trim()),
})

const inviteSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
})

export const workspacesRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/** GET /v1/workspaces — every workspace the caller is in. */
workspacesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      isPersonal: workspaces.isPersonal,
      role: workspaceMembers.role,
      memberCount: sql<number>`(SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = ${workspaces.id})`,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.isPersonal), asc(workspaces.name))
    .all()
  return c.json({
    workspaces: rows.map((r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.ownerId,
      role: r.role,
      isPersonal: r.isPersonal === 1,
      memberCount: Number(r.memberCount),
    })),
  })
})

/** POST /v1/workspaces — create a new workspace; caller becomes owner. */
workspacesRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const id = `ws_${newTrackingId()}`
  const createdAt = Date.now()
  await db.batch([
    db.insert(workspaces).values({
      id,
      name: parsed.data.name,
      ownerId: userId,
      isPersonal: 0,
      createdAt,
    }),
    db.insert(workspaceMembers).values({
      workspaceId: id,
      userId,
      role: 'owner',
      joinedAt: createdAt,
    }),
  ])
  return c.json({ id, name: parsed.data.name })
})

/** PATCH /v1/workspaces/:id — rename. Owner-only. */
workspacesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = renameSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const role = await memberRole(db, userId, id)
  if (role !== 'owner') return c.json({ error: 'forbidden' }, 403)
  const result = await db
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, id))
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true, name: parsed.data.name })
})

/** DELETE /v1/workspaces/:id — owner-only, refuses on personal. */
workspacesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const ws = await db
    .select({ ownerId: workspaces.ownerId, isPersonal: workspaces.isPersonal })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get()
  if (!ws) return c.json({ error: 'not_found' }, 404)
  if (ws.ownerId !== userId) return c.json({ error: 'forbidden' }, 403)
  if (ws.isPersonal === 1) return c.json({ error: 'personal_workspace' }, 400)

  // Cascades to workspace_members, workspace_invites, and templates
  // scoped to this workspace. After delete, any member whose active
  // pointer was this workspace gets fallback-resolved by the
  // auth-middleware on their next request.
  await db.delete(workspaces).where(eq(workspaces.id, id)).run()
  return c.json({ ok: true })
})

/** GET /v1/workspaces/:id/members — every member is allowed to see the roster. */
workspacesRouter.get('/:id/members', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  if (!(await isMember(db, userId, id))) return c.json({ error: 'forbidden' }, 403)
  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      email: users.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, id))
    .orderBy(asc(workspaceMembers.joinedAt))
    .all()
  const pending = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, id),
        sql`${workspaceInvites.acceptedAt} IS NULL`,
        sql`${workspaceInvites.expiresAt} > ${Date.now()}`,
      ),
    )
    .all()
  return c.json({ members: rows, pendingInvites: pending })
})

/** DELETE /v1/workspaces/:id/members/:userId — owner removes a member, or
 *  member removes themselves (leave). Refuses to leave the workspace
 *  ownerless. */
workspacesRouter.delete('/:id/members/:memberId', async (c) => {
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const callerRole = await memberRole(db, userId, id)
  if (!callerRole) return c.json({ error: 'forbidden' }, 403)
  // Members can only remove themselves; owners can remove anyone.
  if (callerRole !== 'owner' && memberId !== userId) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const ws = await db
    .select({ isPersonal: workspaces.isPersonal })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get()
  if (!ws) return c.json({ error: 'not_found' }, 404)
  if (ws.isPersonal === 1) return c.json({ error: 'personal_workspace' }, 400)

  // Prevent leaving the workspace ownerless.
  if (callerRole === 'owner' || memberId === userId) {
    const remainingOwners = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.role, 'owner'),
          sql`${workspaceMembers.userId} != ${memberId}`,
        ),
      )
      .get()
    if (!remainingOwners || Number(remainingOwners.c) === 0) {
      return c.json({ error: 'last_owner' }, 400)
    }
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, id),
        eq(workspaceMembers.userId, memberId),
      ),
    )
    .run()
  // If the leaver had this workspace as active, fall back to their
  // personal one on next request — auth-middleware handles that.
  await db
    .update(users)
    .set({ activeWorkspaceId: `ws_${memberId}` })
    .where(and(eq(users.id, memberId), eq(users.activeWorkspaceId, id)))
    .run()
  return c.json({ ok: true })
})

/** POST /v1/workspaces/:id/invites — owner-only invite-by-email. */
workspacesRouter.post('/:id/invites', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const userId = c.get('userId')
  const userEmail = c.get('userEmail')
  const db = getDb(c.env.DB)
  if ((await memberRole(db, userId, id)) !== 'owner') {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (parsed.data.email === userEmail.toLowerCase()) {
    return c.json({ error: 'self_invite' }, 400)
  }
  const ws = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get()
  if (!ws) return c.json({ error: 'not_found' }, 404)

  // If the invitee already exists and is already a member, no-op.
  const existing = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, id),
        eq(users.email, parsed.data.email),
      ),
    )
    .get()
  if (existing) return c.json({ error: 'already_member' }, 409)

  const token = newTrackingId() + newTrackingId()
  const createdAt = Date.now()
  const expiresAt = createdAt + INVITE_TTL_MS
  await db
    .insert(workspaceInvites)
    .values({
      id: token,
      workspaceId: id,
      email: parsed.data.email,
      invitedBy: userId,
      createdAt,
      expiresAt,
      acceptedAt: null,
    })
    .run()

  const webBase = c.env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app'
  const acceptUrl = `${webBase}/workspaces/accept?token=${encodeURIComponent(token)}`
  try {
    await sendWorkspaceInvite({
      to: parsed.data.email,
      workspaceName: ws.name,
      inviterEmail: userEmail,
      acceptUrl,
      env: c.env,
    })
  } catch (err) {
    createLogger({
      env: c.env,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    }).error('workspace_invite_send_failed', {
      workspaceId: id,
      to: parsed.data.email,
      ...errorMeta(err),
    })
    // Still return ok — the invite is on file. They can re-send.
  }
  return c.json({ ok: true, expiresAt })
})

// Note: the unauthenticated GET /workspace-invites/:token preview lives
// outside this router (registered in index.ts before authMiddleware).

/** POST /v1/workspaces/invites/:token/accept — authenticated. The session
 *  email must match the invite's email so an attacker can't accept
 *  someone else's invite. */
workspacesRouter.post('/invites/:token/accept', async (c) => {
  const token = c.req.param('token')
  const userId = c.get('userId')
  const userEmail = c.get('userEmail')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      workspaceId: workspaceInvites.workspaceId,
      email: workspaceInvites.email,
      expiresAt: workspaceInvites.expiresAt,
      acceptedAt: workspaceInvites.acceptedAt,
    })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.id, token))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.acceptedAt != null) return c.json({ error: 'already_accepted' }, 410)
  if (row.expiresAt < Date.now()) return c.json({ error: 'expired' }, 410)
  if (row.email !== userEmail.toLowerCase()) {
    return c.json({ error: 'wrong_account' }, 403)
  }
  const now = Date.now()
  await db.batch([
    db.insert(workspaceMembers).values({
      workspaceId: row.workspaceId,
      userId,
      role: 'member',
      joinedAt: now,
    }),
    db
      .update(workspaceInvites)
      .set({ acceptedAt: now })
      .where(eq(workspaceInvites.id, token)),
    // Auto-switch active workspace to the one they just joined.
    db
      .update(users)
      .set({ activeWorkspaceId: row.workspaceId })
      .where(eq(users.id, userId)),
  ])
  return c.json({ ok: true, workspaceId: row.workspaceId })
})

/** POST /v1/workspaces/:id/switch — set this workspace as the caller's
 *  active context. Must be a member. */
workspacesRouter.post('/:id/switch', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  if (!(await isMember(db, userId, id))) return c.json({ error: 'forbidden' }, 403)
  await db
    .update(users)
    .set({ activeWorkspaceId: id })
    .where(eq(users.id, userId))
    .run()
  return c.json({ ok: true, workspaceId: id })
})
