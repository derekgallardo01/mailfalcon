import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { events, links, trackedEmails } from '@mailfalcon/db/schema'
import { verify } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { fanoutPush } from '../lib/push-fanout'
import { getHmacSecret } from '../lib/secrets'
import { extractCfGeo, parseUa, truncateIpV4 } from '../lib/ua'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
}

export const clickRouter = new Hono<{ Bindings: Bindings }>()

clickRouter.get('/:id/:linkIdx', async (c) => {
  const id = c.req.param('id')
  const linkIdxParam = c.req.param('linkIdx')
  const sig = c.req.query('s') ?? ''
  const linkIdx = Number.parseInt(linkIdxParam, 10)

  if (!Number.isInteger(linkIdx) || linkIdx < 0) {
    return c.notFound()
  }

  const secret = getHmacSecret(c.env)
  const valid = await verify(id, sig, secret, 12).catch(() => false)
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
          recipientId: null,
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
          console.warn('[mailfalcon] click fanout failed:', err),
        )
      }
    })(),
  )

  return c.redirect(link.originalUrl, 302)
})
