import { Hono } from 'hono'
import { and, asc, eq, gt } from 'drizzle-orm'
import { events, recipients, trackedEmails } from '@mailfalcon/db/schema'
import { getDb } from '../lib/db'
import { getJwtSecret, verifyJwt } from '../lib/jwt'
import { createLogger, errorMeta } from '../lib/logger'
import { concurrentDec, concurrentInc } from '../lib/rate-limit'

type Bindings = {
  ENVIRONMENT: string
  JWT_SECRET?: string
  DB: D1Database
  KV: KVNamespace
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

const STREAM_MAX_PER_USER = 3
// Stream max duration is 60s so this TTL only covers an outlier where
// the decrement never runs — KV reaps the stale counter.
const STREAM_TTL_SEC = 120

interface SessionRecord {
  userId: string
}

export const streamRouter = new Hono<{ Bindings: Bindings }>()

streamRouter.get('/', async (c) => {
  // EventSource can't send Authorization headers, so token comes via query string.
  const token = c.req.query('token')
  let userId: string | null = null

  if (token) {
    try {
      const secret = getJwtSecret(c.env)
      const payload = await verifyJwt(token, secret)
      if (payload) {
        const session = (await c.env.KV.get(
          `session:${payload.jti}`,
          'json',
        )) as SessionRecord | null
        if (session) userId = payload.sub
      }
    } catch {
      // misconfigured; fall through to dev fallback or 401
    }
  }

  if (!userId) {
    if (c.env.ENVIRONMENT === 'development') {
      userId = 'dev-user'
    } else {
      return c.json({ error: 'unauthorized' }, 401)
    }
  }

  // Cap concurrent SSE connections per user. Stops one bad client from
  // burning worker concurrency or our SSE budget by holding open many
  // streams. Counter is decremented when the stream closes.
  const concurrentKey = `stream:${userId}`
  const count = await concurrentInc(c.env.KV, concurrentKey, STREAM_TTL_SEC)
  if (count > STREAM_MAX_PER_USER) {
    await concurrentDec(c.env.KV, concurrentKey, STREAM_TTL_SEC)
    createLogger({ env: c.env }).warn('stream_concurrent_throttle', {
      userId,
      count,
    })
    return c.json({ error: 'too_many_streams' }, 429, {
      'Retry-After': '60',
    })
  }

  const since = Number.parseInt(c.req.query('since') ?? '', 10)
  let lastSeenTs = Number.isFinite(since) && since > 0 ? since : Date.now()

  const db = getDb(c.env.DB)
  const userIdResolved = userId
  const encoder = new TextEncoder()
  const POLL_MS = 5_000
  const MAX_DURATION_MS = 60_000

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`: connected, since=${lastSeenTs}\n\n`),
      )

      const startedAt = Date.now()
      while (Date.now() - startedAt < MAX_DURATION_MS) {
        try {
          const rows = await db
            .select({
              id: events.id,
              emailId: events.emailId,
              type: events.type,
              linkId: events.linkId,
              ts: events.ts,
              uaClass: events.uaClass,
              country: events.country,
              city: events.city,
              regionCode: events.regionCode,
              deviceType: events.deviceType,
              isFirstOpen: events.isFirstOpen,
              subject: trackedEmails.subject,
              recipientLabel: recipients.displayLabel,
            })
            .from(events)
            .innerJoin(trackedEmails, eq(events.emailId, trackedEmails.id))
            .leftJoin(recipients, eq(recipients.id, events.recipientId))
            .where(
              and(
                eq(trackedEmails.userId, userIdResolved),
                gt(events.ts, lastSeenTs),
              ),
            )
            .orderBy(asc(events.ts))
            .limit(50)
            .all()

          for (const row of rows) {
            const payload = {
              id: row.id,
              emailId: row.emailId,
              type: row.type,
              linkId: row.linkId,
              ts: row.ts,
              uaClass: row.uaClass,
              country: row.country,
              isFirstOpen: row.isFirstOpen === 1,
              subject: row.subject,
              recipientLabel: row.recipientLabel,
              city: row.city,
              regionCode: row.regionCode,
              deviceType: row.deviceType,
            }
            controller.enqueue(
              encoder.encode(`event: event\ndata: ${JSON.stringify(payload)}\n\n`),
            )
            lastSeenTs = Math.max(lastSeenTs, row.ts)
          }

          // Heartbeat so intermediaries don't close.
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: 'poll_failed' })}\n\n`,
            ),
          )
          createLogger({ env: c.env }).error(
            'stream_poll_failed',
            errorMeta(err),
          )
        }

        await new Promise<void>((r) => setTimeout(r, POLL_MS))
      }

      controller.enqueue(encoder.encode(`event: bye\ndata: reconnect\n\n`))
      controller.close()
      await concurrentDec(c.env.KV, concurrentKey, STREAM_TTL_SEC)
    },
    async cancel() {
      await concurrentDec(c.env.KV, concurrentKey, STREAM_TTL_SEC)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
