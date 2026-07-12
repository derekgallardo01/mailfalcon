import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { events, recipients, trackedEmails, users } from '@mailfalcon/db/schema'
import { verify } from '@mailfalcon/shared'
import { getDb } from '../lib/db'
import { getClientIp } from '../lib/ip'
import { createLogger, errorMeta } from '../lib/logger'
import { fanoutPush } from '../lib/push-fanout'
import { rateLimit } from '../lib/rate-limit'
import { getHmacSecret } from '../lib/secrets'
import { extractCfGeo, hashUa, parseUa, truncateIpV4, type UaDetails } from '../lib/ua'

/** SHA-256 hex of the lowercased address. Matches the extension's
 *  `sha256Hex(r.address.toLowerCase())` used at mint time, so a
 *  server-computed sender hash can be compared to a recipient row's
 *  stored hashedAddr for self-open detection. */
async function sha256HexLower(address: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(address.toLowerCase()),
  )
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

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

// Window where opens are treated as bot-prefetches: Gmail's Sent-copy
// auto-render, corporate MTA scans, delivery-time image proxies, and
// AV/spam scanners all fetch the pixel shortly after send with a
// browser-like UA that our BOT_PATTERNS list can't reliably catch.
// Suppress notifications inside this window so the sender doesn't get
// pinged about their own send or about scanners. The open is still
// recorded in the events table so dashboard totals stay accurate.
// Widened from 30s → 90s to catch late corporate SEG scans.
const SELF_OPEN_GUARD_MS = 90_000

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

export function buildLocationLabel(
  city: string | null,
  regionCode: string | null,
  country: string | null,
): string | undefined {
  const parts: string[] = []
  if (city) parts.push(city)
  if (regionCode) parts.push(regionCode)
  else if (country) parts.push(country)
  return parts.length > 0 ? parts.join(', ') : undefined
}

export function buildDeviceLabel(ua: UaDetails): string | undefined {
  const segs: string[] = []
  if (ua.deviceType) {
    const t = ua.deviceType
    segs.push(t.charAt(0).toUpperCase() + t.slice(1))
  }
  if (ua.osName) segs.push(ua.osName)
  if (ua.browserName) segs.push(ua.browserName)
  return segs.length > 0 ? segs.join(' · ') : undefined
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
    .select({
      id: trackedEmails.id,
      userId: trackedEmails.userId,
      sentAt: trackedEmails.sentAt,
      subject: trackedEmails.subject,
      notificationsMuted: trackedEmails.notificationsMuted,
    })
    .from(trackedEmails)
    .where(eq(trackedEmails.id, id))
    .get()
  if (!row) return gif()

  const isSelfOpenWindow = Date.now() - row.sentAt < SELF_OPEN_GUARD_MS
  const muted = row.notificationsMuted === 1

  // Sender's-own-Gmail-context guard. Any pixel fetch with a Gmail
  // Referer originates from the sender's own web session (compose
  // iframe rendering the injected img, drafts view re-rendering, sent-
  // folder auto-preview). Real recipient opens NEVER produce this
  // combo:
  //   - Gmail recipients: their web client rewrites external images
  //     through googleimageproxy — the referer we see is Google's, not
  //     mail.google.com, and the UA is bot-classified anyway.
  //   - Non-Gmail recipients (Outlook, Apple Mail, mobile clients):
  //     no mail.google.com referer at all.
  // So a mail.google.com referer is unambiguously the sender's own
  // Gmail — suppress the notification, keep the event record for
  // dashboard totals.
  const referer = c.req.header('Referer') ?? c.req.header('Referrer') ?? ''
  const isSenderGmailContext =
    referer.startsWith('https://mail.google.com') ||
    referer.startsWith('http://mail.google.com')

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
      // Notification gate: 'bot' + 'unknown' UAs suppress. Real
      // browsers always send a UA — omission is a scanner signal.
      const humanLike =
        uaDetails.uaClass === 'desktop' || uaDetails.uaClass === 'mobile'

      // Sender-IP guard. Some Gmail configs send Referrer-Policy:
      // no-referrer, stripping the referer that isSenderGmailContext
      // relied on. Fall back to comparing pixel-fetch IP against the
      // sender's mint-time IP stashed in KV by the mint handler.
      let isSenderIpFetch = false
      try {
        const mintIp = await c.env.KV.get(`mint-ip:${row.id}`)
        if (mintIp && ipFull && mintIp === ipFull) isSenderIpFetch = true
      } catch {
        /* fail-open: notification still fires if KV blips */
      }

      // Self-recipient guard: sender opening their own to-self / cc-self
      // copy. Compare sender's SHA-256 to the recipient row's hashedAddr.
      let recipientLabel: string | null = null
      let isSelfRecipientOpen = false
      if (recipientId) {
        const [rec, sender] = await Promise.all([
          db
            .select({
              displayLabel: recipients.displayLabel,
              hashedAddr: recipients.hashedAddr,
            })
            .from(recipients)
            .where(eq(recipients.id, recipientId))
            .get(),
          db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, row.userId))
            .get(),
        ])
        recipientLabel = rec?.displayLabel ?? null
        if (rec?.hashedAddr && sender?.email) {
          const senderHash = await sha256HexLower(sender.email)
          isSelfRecipientOpen = rec.hashedAddr === senderHash
        }
      }

      const notificationSuppressed =
        !humanLike ||
        isSelfOpenWindow ||
        muted ||
        isSenderGmailContext ||
        isSenderIpFetch ||
        isSelfRecipientOpen

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
          notificationSuppressed: notificationSuppressed ? 1 : 0,
        })
        .run()

      if (notificationSuppressed) {
        createLogger({ env: c.env }).info('pixel_notification_suppressed', {
          emailId: row.id,
          uaClass: uaDetails.uaClass,
          humanLike,
          isSelfOpenWindow,
          muted,
          isSenderGmailContext,
          isSenderIpFetch,
          isSelfRecipientOpen,
          referer: referer.slice(0, 60),
        })
        return
      }

      await fanoutPush(db, c.env, row.userId, {
        kind: 'open',
        subject: row.subject,
        emailId: row.id,
        text: 'Tracked email opened',
        recipientLabel: recipientLabel ?? undefined,
        location: buildLocationLabel(geo.city, geo.regionCode, country),
        device: buildDeviceLabel(uaDetails),
      }).catch((err) =>
        createLogger({ env: c.env }).warn('pixel_fanout_failed', errorMeta(err)),
      )
    })(),
  )

  return gif()
})
