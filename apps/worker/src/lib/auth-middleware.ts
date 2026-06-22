import type { MiddlewareHandler } from 'hono'
import { and, eq, gt } from 'drizzle-orm'
import { sessions, users, workspaceMembers } from '@mailfalcon/db/schema'
import { getDb } from './db'
import { ensureDevUser } from './dev-user'
import { getJwtSecret, verifyJwt } from './jwt'
import { ensurePersonalWorkspace } from './workspace'

type Bindings = {
  ENVIRONMENT: string
  JWT_SECRET?: string
  DB: D1Database
  KV: KVNamespace
}

export type Variables = {
  userId: string
  userEmail: string
  /** The workspace this request is acting in — defaults to the user's
   *  personal workspace; switched via POST /v1/workspaces/:id/switch. */
  workspaceId: string
  workspaceRole: 'owner' | 'member'
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: Bindings
  Variables: Variables
}> = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    let secret: string
    try {
      secret = getJwtSecret(c.env)
    } catch {
      return c.json({ error: 'misconfigured' }, 500)
    }
    const payload = await verifyJwt(token, secret)
    if (payload) {
      const db = getDb(c.env.DB)
      const session = await db
        .select({ userId: sessions.userId })
        .from(sessions)
        .where(
          and(eq(sessions.jti, payload.jti), gt(sessions.expiresAt, Date.now())),
        )
        .get()
      if (session) {
        const userId = payload.sub
        const user = await db
          .select({
            email: users.email,
            activeWorkspaceId: users.activeWorkspaceId,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .get()
        if (!user) return c.json({ error: 'unauthorized' }, 401)

        // Bootstrap a personal workspace if the user somehow has none
        // (e.g. legacy account that signed in before the migration).
        let workspaceId = user.activeWorkspaceId
        if (!workspaceId) {
          workspaceId = await ensurePersonalWorkspace(db, userId, user.createdAt)
        }
        const member = await db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.userId, userId),
              eq(workspaceMembers.workspaceId, workspaceId),
            ),
          )
          .get()
        // The active workspace pointer could be stale (user was removed
        // from a workspace they had set as active). Fall back to the
        // personal one.
        if (!member) {
          workspaceId = await ensurePersonalWorkspace(db, userId, user.createdAt)
          await db
            .update(users)
            .set({ activeWorkspaceId: workspaceId })
            .where(eq(users.id, userId))
            .run()
        }
        c.set('userId', userId)
        c.set('userEmail', user.email)
        c.set('workspaceId', workspaceId)
        c.set('workspaceRole', (member?.role ?? 'owner') as 'owner' | 'member')
        return next()
      }
    }
  }

  if (c.env.ENVIRONMENT === 'development') {
    const db = getDb(c.env.DB)
    const userId = await ensureDevUser(db)
    const workspaceId = await ensurePersonalWorkspace(db, userId, Date.now())
    c.set('userId', userId)
    c.set('userEmail', 'dev@localhost')
    c.set('workspaceId', workspaceId)
    c.set('workspaceRole', 'owner')
    return next()
  }

  return c.json({ error: 'unauthorized' }, 401)
}
