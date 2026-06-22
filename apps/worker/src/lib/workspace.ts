import { and, eq, sql } from 'drizzle-orm'
import {
  users,
  workspaceMembers,
  workspaces,
} from '@mailfalcon/db/schema'
import type { getDb } from './db'

type Db = ReturnType<typeof getDb>

/** Returns the personal workspace id for a user, creating it if it
 *  doesn't already exist (e.g. for a brand-new signup). The id is
 *  deterministic — `ws_<userId>` — to match the backfill migration and
 *  make re-invocation safe. */
export async function ensurePersonalWorkspace(
  db: Db,
  userId: string,
  createdAt: number,
): Promise<string> {
  const workspaceId = `ws_${userId}`
  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get()
  if (existing) return workspaceId

  await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: 'Personal',
      ownerId: userId,
      isPersonal: 1,
      createdAt,
    })
    .onConflictDoNothing()
    .run()
  await db
    .insert(workspaceMembers)
    .values({
      workspaceId,
      userId,
      role: 'owner',
      joinedAt: createdAt,
    })
    .onConflictDoNothing()
    .run()
  await db
    .update(users)
    .set({ activeWorkspaceId: workspaceId })
    .where(and(eq(users.id, userId), sql`${users.activeWorkspaceId} IS NULL`))
    .run()
  return workspaceId
}

/** Returns the caller's role within the given workspace, or null if
 *  they're not a member. */
export async function memberRole(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<'owner' | 'member' | null> {
  const row = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .get()
  return row?.role ?? null
}

export async function isMember(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  return (await memberRole(db, userId, workspaceId)) !== null
}

/** Used by the team-view aggregator: returns every userId that
 *  belongs to the workspace. */
export async function workspaceUserIds(
  db: Db,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .all()
  return rows.map((r) => r.userId)
}
