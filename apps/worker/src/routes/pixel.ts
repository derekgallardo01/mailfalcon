import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { events, trackedEmails } from '@mailfalcon/db/schema'
import { verify } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { createLogger, errorMeta } from '../lib/logger'
import { fanoutPush } from '../lib/push-fanout'
import { rateLimit } from '../lib/rate-limit'
import { getHmacSecret } from '../lib/secrets'
import { extractCfGeo, hashUa, parseUa, truncateIpV4 } from '../lib/ua'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
  KV: KVNamespace
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
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
  const recipientId = c.req.query('r') ?? null

  const secret = getHmacSecret(c.env)
  // Per-recipient URL signs `${id}:${recipientId}`. Legacy URLs (no r=)
  // sign just `${id}`. Reject if neither verifies.
  const signedMessage = recipientId ? `${id}:${recipientId}` : id
  const valid = await verify(signedMessage, sig, secret, 12).catch(() => false)
  if (!valid) return gif()

  // Per-IP throttle: 60 pixel hits per IP per minute. On exceed, still
  // serve the GIF (so attacker can't tell), but skip the DB write so a
  // bot can't amplify event volume.
  const ip = getClientIp(c)
  const ipLimit = await rateLimit(c.env.KV, `pix:${ip}`, 60, 60)
  if (!ipLimit.allowed) {
    createLogger({ env: c.env }).warn('pixel_ip_throttle', { ip, id })
    return gif()
  }

  const db = getDb(c.env.DB)
  const row = await db
    .select({ id: trackedEmails.id, userId: trackedEmails.userId })
    .from(trackedEmails)
    .where(eq(trackedEmails.id, id))
    .get()
  if (!row) return gif()

  const ua = c.req.header('User-Agent') ?? ''
  const uaDetails = parseUa(ua)
  const ipFull = c.req.header('CF-Connecting-IP') ?? null
  const ipPrefix = truncateIpV4(ipFull)
  const geo = extractCfGeo(c.req.raw)
  // Fall back to the CF-IPCountry header if cf object isn't populated.
  const country = geo.country ?? c.req.header('CF-IPCountry') ?? null

  const uaHash = await hashUa(ua)
  // Scope the first-open nonce to the recipient so Alice's open doesn't
  // mark Bob's as non-first.
  const nonceKey = recipientId
    ? `nonce:${id}:${recipientId}:${uaHash}`
    : `nonce:${id}:${uaHash}`
  const seen = await c.env.KV.get(nonceKey)
  const isFirstOpen = seen ? 0 : 1
  if (!seen) {
    c.executionCtx.waitUntil(c.env.KV.put(nonceKey, '1', { expirationTtl: 86400 }))
  }

  c.executionCtx.waitUntil(
    (async () => {
      await db
        .insert(events)
        .values({
          emailId: id,
          recipientId,
          type: 'open',
          linkId: null,
          ts: Date.now(),
          uaClass: uaDetails.uaClass,
          ipPrefix,
          ipFull,
          country,
          region: geo.region,
          regionCode: geo.regionCode,
          city: geo.city,
          postalCode: geo.postalCode,
          latitude: geo.latitude,
          longitude: geo.longitude,
          timezone: geo.timezone,
          browserName: uaDetails.browserName,
          browserVersion: uaDetails.browserVersion,
          osName: uaDetails.osName,
          osVersion: uaDetails.osVersion,
          deviceType: uaDetails.deviceType,
          deviceVendor: uaDetails.deviceVendor,
          deviceModel: uaDetails.deviceModel,
          isFirstOpen,
        })
        .run()
      if (uaDetails.uaClass !== 'bot') {
        await fanoutPush(db, c.env, row.userId).catch((err) =>
          createLogger({ env: c.env }).warn(
            'pixel_fanout_failed',
            errorMeta(err),
          ),
        )
      }
    })(),
  )

  return gif()
})
