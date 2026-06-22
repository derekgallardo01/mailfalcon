import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, lt, sql } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

const PING_THROTTLE_MS = 30 * 60 * 1000

const pingSchema = z.object({
  version: z.string().min(1).max(40),
  installId: z.string().min(1).max(60),
})

export const extensionRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * POST /v1/extension/ping — heartbeat from the extension. Updates
 * users.last_seen_at + extension_version; sets installed_at +
 * extension_install_id on first call. Throttled to one DB write per
 * user per 30 minutes so SW-restart storms don't hammer D1.
 */
extensionRouter.post('/ping', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = pingSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const now = Date.now()
  const throttleCutoff = now - PING_THROTTLE_MS

  // Throttle: only write if last_seen_at is stale OR installed_at is null
  // (first ping must populate the install row).
  const result = await db
    .update(users)
    .set({
      lastSeenAt: now,
      extensionVersion: parsed.data.version,
      // COALESCE keeps the first install timestamp + installId stable.
      installedAt: sql`COALESCE(${users.installedAt}, ${now})`,
      extensionInstallId: sql`COALESCE(${users.extensionInstallId}, ${parsed.data.installId})`,
    })
    .where(
      and(
        eq(users.id, userId),
        sql`(${users.lastSeenAt} IS NULL OR ${users.lastSeenAt} < ${throttleCutoff})`,
      ),
    )
    .run()

  return c.json({
    ok: true,
    updated: result.meta.changes > 0,
  })
})
