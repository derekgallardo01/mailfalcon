import { Hono } from 'hono'
import { events, trackedEmails } from '@mailfalcon/db/schema'
import { verify } from '@mailfalcon/shared'
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { getHmacSecret } from '../lib/secrets'
import { classifyUa, hashUa, truncateIpV4 } from '../lib/ua'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
  KV: KVNamespace
}

const TRANSPARENT_GIF = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
])

const GIF_HEADERS: HeadersInit = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'private, no-store, must-revalidate',
  'Content-Length': String(TRANSPARENT_GIF.byteLength),
}

function gif(): Response {
  return new Response(TRANSPARENT_GIF, { headers: GIF_HEADERS })
}

export const pixelRouter = new Hono<{ Bindings: Bindings }>()

pixelRouter.get('/:idWithExt', async (c) => {
  const idWithExt = c.req.param('idWithExt')
  const id = idWithExt.replace(/\.gif$/, '')
  const sig = c.req.query('s') ?? ''

  const secret = getHmacSecret(c.env)
  const valid = await verify(id, sig, secret, 12).catch(() => false)
  // Silent fail: always return the GIF so probes can't infer validity.
  if (!valid) return gif()

  const db = getDb(c.env.DB)
  const row = await db
    .select({ id: trackedEmails.id })
    .from(trackedEmails)
    .where(eq(trackedEmails.id, id))
    .get()
  if (!row) return gif()

  const ua = c.req.header('User-Agent') ?? ''
  const uaClass = classifyUa(ua)
  const ipPrefix = truncateIpV4(c.req.header('CF-Connecting-IP'))
  const country = c.req.header('CF-IPCountry') ?? null

  // First-open dedupe: KV nonce keyed by id + ua hash, 24h TTL.
  const uaHash = await hashUa(ua)
  const nonceKey = `nonce:${id}:${uaHash}`
  const seen = await c.env.KV.get(nonceKey)
  const isFirstOpen = seen ? 0 : 1
  if (!seen) {
    c.executionCtx.waitUntil(c.env.KV.put(nonceKey, '1', { expirationTtl: 86400 }))
  }

  c.executionCtx.waitUntil(
    db
      .insert(events)
      .values({
        emailId: id,
        recipientId: null,
        type: 'open',
        linkId: null,
        ts: Date.now(),
        uaClass,
        ipPrefix,
        country,
        isFirstOpen,
      })
      .run()
      .then(() => undefined),
  )

  return gif()
})
