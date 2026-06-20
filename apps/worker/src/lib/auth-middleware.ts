import type { MiddlewareHandler } from 'hono'
import { and, eq, gt } from 'drizzle-orm'
import { sessions } from '@mailfalcon/db/schema'
import { getDb } from './db'
import { ensureDevUser } from './dev-user'
import { getJwtSecret, verifyJwt } from './jwt'

type Bindings = {
  ENVIRONMENT: string
  JWT_SECRET?: string
  DB: D1Database
  KV: KVNamespace
}

export type Variables = {
  userId: string
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
        c.set('userId', payload.sub)
        return next()
      }
    }
  }

  if (c.env.ENVIRONMENT === 'development') {
    const db = getDb(c.env.DB)
    const userId = await ensureDevUser(db)
    c.set('userId', userId)
    return next()
  }

  return c.json({ error: 'unauthorized' }, 401)
}
