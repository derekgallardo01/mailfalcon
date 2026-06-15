import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { events, links, trackedEmails } from '@mailfalcon/db/schema'
import { verify } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { createLogger, errorMeta } from '../lib/logger'
import { fanoutPush } from '../lib/push-fanout'
import { rateLimit } from '../lib/rate-limit'
import { getHmacSecret } from '../lib/secrets'
import { extractCfGeo, parseUa, truncateIpV4 } from '../lib/ua'

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

export const clickRouter = new Hono<{ Bindings: Bindings }>()

clickRouter.get('/:id/:linkIdx', async (c) => {
  const id = c.req.param('id')
  const linkIdxParam = c.req.param('linkIdx')
  const sig = c.req.query('s') ?? ''
  const recipientId = c.req.query('r') ?? null
  const linkIdx = Number.parseInt(linkIdxParam, 10)

  if (!Number.isInteger(linkIdx) || linkIdx < 0) {
    return c.notFound()
  }

  const secret = getHmacSecret(c.env)
  // Per-recipient URL signs `${id}:${recipientId}:c`. Legacy URLs sign
  // just `${id}`. Try the recipient-bound version first when r= is
  // present; fall back so old extension builds keep working.
  const signedMessage = recipientId ? `${id}:${recipientId}:c` : id
  const valid = await verify(signedMessage, sig, secret, 12).catch(() => false)
  if (!valid) return c.notFound()

  const db = getDb(c.env.DB)
  const linkId = `${id}:${linkIdx}`
  const [link, email] = await Promise.all([
    db
      .select({ originalUrl: links.originalUrl })
      .from(links)
      .where(eq(links.id, linkId))
      .get(),
    db
      .select({ userId: trackedEmails.userId })
      .from(trackedEmails)
      .where(eq(trackedEmails.id, id))
      .get(),
  ])
  if (!link || !email) return c.notFound()

  // Per-IP throttle: 60 clicks per IP per minute. On exceed, still
  // redirect (so the user doesn't see a broken link), but skip the DB
  // write so a bot can't amplify event volume.
  const ip = getClientIp(c)
  const ipLimit = await rateLimit(c.env.KV, `clk:${ip}`, 60, 60)
  if (!ipLimit.allowed) {
    createLogger({ env: c.env }).warn('click_ip_throttle', { ip, id })
    return c.redirect(link.originalUrl, 302)
  }

  const ua = c.req.header('User-Agent') ?? ''
  const uaDetails = parseUa(ua)
  const ipFull = c.req.header('CF-Connecting-IP') ?? null
  const ipPrefix = truncateIpV4(ipFull)
  const geo = extractCfGeo(c.req.raw)
  const country = geo.country ?? c.req.header('CF-IPCountry') ?? null

  c.executionCtx.waitUntil(
    (async () => {
      await db
        .insert(events)
        .values({
          emailId: id,
          recipientId,
          type: 'click',
          linkId,
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
          isFirstOpen: 0,
        })
        .run()
      if (uaDetails.uaClass !== 'bot') {
        await fanoutPush(db, c.env, email.userId).catch((err) =>
          createLogger({ env: c.env }).warn(
            'click_fanout_failed',
            errorMeta(err),
          ),
        )
      }
    })(),
  )

  return c.redirect(link.originalUrl, 302)
})
