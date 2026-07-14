import { Hono } from 'hono'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import {
  googleTokens,
  links,
  recipients,
  trackedEmails,
  users,
} from '@mailfalcon/db/schema'
import { newSalt, newTrackingId, sign, clickUrl, pixelUrl } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import {
  GMAIL_COMPOSE_SCOPES,
  exchangeAndStoreGoogleTokens,
  getGoogleAccessToken,
} from '../lib/google-tokens'
import { createLogger, errorMeta } from '../lib/logger'
import { base64UrlEncodeRfc5322, buildRfc5322 } from '../lib/rfc5322'
import { getHmacSecret } from '../lib/secrets'
import { checkAndIncrementUsage } from '../lib/usage'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  KV: KVNamespace
  HMAC_SECRET?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  PUBLIC_WEB_URL?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export const composeRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/**
 * GET /v1/compose/oauth/authorize — returns the Google authorize URL
 * the web app should open in a popup or same-window redirect. Uses
 * PKCE so no client secret ever hits the browser.
 *
 * Web app is expected to:
 *   1. Generate a random code_verifier (43-128 chars).
 *   2. Derive code_challenge = base64url(sha256(code_verifier)).
 *   3. POST to this endpoint with { codeChallenge, redirectUri }.
 *   4. Open the returned url in a popup / new tab.
 *   5. When Google redirects back with ?code=..., POST it here at
 *      /callback with the original code_verifier.
 */
const authorizeSchema = z.object({
  codeChallenge: z.string().min(43).max(128),
  redirectUri: z.string().url().max(500),
})

composeRouter.post('/oauth/authorize', async (c) => {
  if (!c.env.GOOGLE_OAUTH_CLIENT_ID) {
    return c.json({ error: 'oauth_not_configured' }, 503)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = authorizeSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: parsed.data.redirectUri,
    response_type: 'code',
    scope: GMAIL_COMPOSE_SCOPES,
    code_challenge: parsed.data.codeChallenge,
    code_challenge_method: 'S256',
    // access_type=offline + prompt=consent guarantees a refresh_token
    // even for users who've previously granted these scopes.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  return c.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  })
})

const callbackSchema = z.object({
  code: z.string().min(1).max(2000),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(500),
})

composeRouter.post('/oauth/callback', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = callbackSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  try {
    const result = await exchangeAndStoreGoogleTokens(db, c.env, {
      userId,
      code: parsed.data.code,
      codeVerifier: parsed.data.codeVerifier,
      redirectUri: parsed.data.redirectUri,
    })
    createLogger({ env: c.env }).info('gmail_connected', {
      userId,
      googleEmail: result.googleEmail,
    })
    return c.json({ ok: true, googleEmail: result.googleEmail })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    createLogger({ env: c.env }).warn('gmail_connect_failed', {
      userId,
      ...errorMeta(err),
    })
    return c.json({ error: 'gmail_connect_failed', reason: msg }, 502)
  }
})

/** Critical Gmail scopes the compose flow can't function without.
 *  Excludes openid/email/profile because Google normalizes those into
 *  userinfo URIs in the token response (openid → openid, email →
 *  https://www.googleapis.com/auth/userinfo.email, profile → …/userinfo.profile),
 *  which would false-positive a naive string-inclusion check. */
const CRITICAL_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
]

/** GET /v1/compose/oauth/status — is Gmail connected? Which address? */
composeRouter.get('/oauth/status', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      googleEmail: googleTokens.googleEmail,
      scopes: googleTokens.scopes,
      connectedAt: googleTokens.connectedAt,
      lastUsedAt: googleTokens.lastUsedAt,
    })
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId))
    .get()
  if (!row) {
    return c.json({ connected: false })
  }
  // Only flag drift for the Gmail scopes we genuinely can't operate
  // without. OIDC scope name normalization is expected and harmless.
  const grantedScopes = row.scopes.split(' ').filter(Boolean)
  const missing = CRITICAL_GMAIL_SCOPES.filter((s) => !grantedScopes.includes(s))
  return c.json({
    connected: true,
    googleEmail: row.googleEmail,
    connectedAt: row.connectedAt,
    lastUsedAt: row.lastUsedAt,
    scopesUpToDate: missing.length === 0,
    missingScopes: missing,
  })
})

/** DELETE /v1/compose/oauth — disconnect Gmail. Deletes local tokens;
 *  doesn't call Google's revoke endpoint (user can revoke via Google
 *  account settings if they want to remove the grant entirely). */
composeRouter.delete('/oauth', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId)).run()
  createLogger({ env: c.env }).info('gmail_disconnected', { userId })
  return c.json({ ok: true })
})

const addressSchema = z
  .string()
  .max(320)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalid_email')

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(200).default('application/octet-stream'),
  /** Standard base64 (NOT base64url) of the file bytes. */
  dataBase64: z.string().max(35_000_000), // ~25MB decoded — Gmail's limit
})

const sendSchema = z.object({
  to: z.array(addressSchema).min(1).max(50),
  cc: z.array(addressSchema).max(50).default([]),
  bcc: z.array(addressSchema).max(50).default([]),
  subject: z.string().max(500).default(''),
  bodyHtml: z.string().max(500_000),
  /** Optional Gmail threadId for reply-in-thread. When set the sent
   *  message is grouped with the existing thread. */
  threadId: z.string().max(200).optional(),
  /** Message-ID of the parent for RFC 5322 In-Reply-To + References. */
  inReplyToMessageId: z.string().max(300).optional(),
  /** Prior References header from the source message. */
  references: z.string().max(2000).optional(),
  /** Up to 10 files, ~25MB combined per Gmail's limit. */
  attachments: z.array(attachmentSchema).max(10).default([]),
})

interface GmailSendResponse {
  id: string
  threadId: string
  labelIds?: string[]
}

/**
 * POST /v1/compose/send — the mobile-web compose endpoint. Mints a
 * tracked_email, injects the tracking pixel + rewrites <a href> to
 * per-recipient click-tracking URLs, builds an RFC 5322 message, and
 * calls Gmail API users.messages.send. Returns the Gmail message-id +
 * thread-id + the internal emailId for dashboard deep-links.
 *
 * Uses shared-pixel mode (single pixel URL for the whole email) when
 * there are multiple recipients — same trade-off as the extension's
 * default. Per-recipient attribution requires mail-merge mode which
 * this endpoint doesn't yet support (v2 feature).
 */
composeRouter.post('/send', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Load sender + tier — needed for tracker host (custom domain) and
  // the "From" address on the outgoing message.
  const user = await db
    .select({
      email: users.email,
      tier: users.tier,
      customTrackerHost: users.customTrackerHost,
      customTrackerVerifiedAt: users.customTrackerVerifiedAt,
      companyName: users.companyName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) return c.json({ error: 'not_found' }, 404)

  const usage = await checkAndIncrementUsage(c.env.KV, userId, user.tier ?? 'free')
  if (!usage.allowed) {
    return c.json(
      {
        error: 'free_tier_cap_reached',
        used: usage.used,
        limit: usage.limit,
        message: `Free plan allows ${usage.limit} tracked emails per day. Upgrade to Pro for unlimited.`,
      },
      429,
    )
  }

  // Fetch a valid Gmail access token; also confirms the user has
  // connected their Gmail account.
  let accessToken: string
  let googleEmail: string
  try {
    const t = await getGoogleAccessToken(db, c.env, userId)
    accessToken = t.accessToken
    googleEmail = t.googleEmail
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return c.json({ error: 'gmail_not_ready', reason: msg }, 400)
  }

  // Extract every <a href="..."> URL so we can mint links + rewrite.
  // Regex is fine for the compose case because the body is user-typed
  // in our own editor and won't have exotic markup. Order matters:
  // idx here IS the link idx in the tracked_emails row.
  const linkMatches = [...parsed.data.bodyHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1/gi)]
  const originalLinks = linkMatches.map((m) => m[2]!).filter((u) => /^https?:\/\//i.test(u))

  const secret = getHmacSecret(c.env)
  const id = newTrackingId()
  const hmacSalt = newSalt()
  const now = Date.now()

  // Build recipient rows (all addresses in to+cc+bcc get one row).
  const allAddresses = [...parsed.data.to, ...parsed.data.cc, ...parsed.data.bcc]
  const recipientRows = await Promise.all(
    allAddresses.map(async (addr) => ({
      id: `${id}:r${Math.random().toString(36).slice(2, 10)}`,
      emailId: id,
      hashedAddr: await sha256HexLower(addr),
      displayLabel: addr.split('@')[0] ?? addr,
    })),
  )

  await db.batch([
    db.insert(trackedEmails).values({
      id,
      userId,
      subjectHash: null,
      subject: parsed.data.subject,
      threadId: parsed.data.threadId ?? null,
      messageId: null,
      recipientCount: allAddresses.length,
      sentAt: now,
      hmacSalt,
      privacyMode: 0,
    }),
    ...originalLinks.map((url, idx) =>
      db.insert(links).values({
        id: `${id}:${idx}`,
        emailId: id,
        idx,
        originalUrl: url,
      }),
    ),
    ...recipientRows.map((r) => db.insert(recipients).values(r)),
    db
      .update(users)
      .set({ firstSendAt: sql`COALESCE(${users.firstSendAt}, ${now})` })
      .where(eq(users.id, userId)),
  ])

  // Sender IP for the pixel-handler self-open guard.
  const senderIp = c.req.header('CF-Connecting-IP') ?? null
  if (senderIp) {
    c.executionCtx.waitUntil(
      c.env.KV.put(`mint-ip:${id}`, senderIp, { expirationTtl: 24 * 60 * 60 }).catch(
        () => undefined,
      ),
    )
  }

  const trackerHost =
    user.customTrackerHost && user.customTrackerVerifiedAt
      ? `https://${user.customTrackerHost}`
      : 'https://t.mailfalcon.app'

  // Shared-pixel mode: sign over just `${id}` (no recipientId). The
  // /v1/emails endpoint mirrors this; per-recipient pixels are a
  // future upgrade for the compose flow.
  const pixelSig = await sign(id, secret, 12)

  // Rewrite the body: replace each <a href> with the click-tracked
  // URL (in matched order), then append the tracking pixel img.
  let rewrittenBody = parsed.data.bodyHtml
  let linkIdx = 0
  rewrittenBody = rewrittenBody.replace(
    /(<a\b[^>]*\bhref\s*=\s*)(["'])([^"']+)\2/gi,
    (whole, prefix: string, quote: string, url: string) => {
      if (!/^https?:\/\//i.test(url)) return whole
      const idxNow = linkIdx++
      // We use pixelSig here because the current shared-pixel design
      // signs everything over just `${id}`. When we ship per-recipient
      // mode we'll switch to per-recipient click sigs.
      const rewritten = clickUrl(id, idxNow, pixelSig, trackerHost)
      return `${prefix}${quote}${rewritten}${quote}`
    },
  )
  // Style mirrors the extension's known-good pixel: visible 1x1
  // block. NEVER `display:none` — Gmail (esp. mobile) skips those
  // when deciding whether to prefetch through googleimageproxy, which
  // means the pixel never fires and the open goes untracked.
  const pixelImg = `<img src="${pixelUrl(id, pixelSig, trackerHost)}" width="1" height="1" alt="" style="border:0;display:block;height:1px;width:1px;">`
  // Wrap the body in a full HTML document so Gmail treats it as
  // proper HTML content (raw fragments sometimes get sanitized). If
  // the caller already sent a full document, insert the pixel just
  // before </body>; otherwise wrap + append.
  if (/<html[\s>]/i.test(rewrittenBody)) {
    if (/<\/body>/i.test(rewrittenBody)) {
      rewrittenBody = rewrittenBody.replace(/<\/body>/i, `${pixelImg}</body>`)
    } else {
      rewrittenBody = `${rewrittenBody}${pixelImg}`
    }
  } else {
    rewrittenBody = `<!doctype html><html><body>${rewrittenBody}${pixelImg}</body></html>`
  }

  // Guard: total attachment payload cap ~25MB base64-encoded. This
  // protects the worker's request-body limit + matches Gmail's own
  // per-message size limit.
  const totalAttachmentBytes = parsed.data.attachments.reduce(
    (s, a) => s + a.dataBase64.length,
    0,
  )
  if (totalAttachmentBytes > 34_000_000) {
    return c.json({ error: 'attachments_too_large', bytes: totalAttachmentBytes }, 413)
  }

  const raw = buildRfc5322({
    fromAddress: googleEmail,
    fromName: user.companyName ?? undefined,
    to: parsed.data.to,
    cc: parsed.data.cc,
    bcc: parsed.data.bcc,
    subject: parsed.data.subject,
    htmlBody: rewrittenBody,
    inReplyTo: parsed.data.inReplyToMessageId,
    references: parsed.data.references,
    attachments: parsed.data.attachments,
  })
  const encoded = base64UrlEncodeRfc5322(raw)

  const gmailBody: { raw: string; threadId?: string } = { raw: encoded }
  if (parsed.data.threadId) gmailBody.threadId = parsed.data.threadId

  const gmailRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gmailBody),
    },
  )

  if (!gmailRes.ok) {
    const text = await gmailRes.text()
    createLogger({ env: c.env }).warn('gmail_send_failed', {
      userId,
      status: gmailRes.status,
      detail: text.slice(0, 300),
    })
    // Best-effort rollback: leave the tracked_email row; user might
    // retry and we want the tracking to fire once the send does. But
    // do return a specific error so the UI can surface it.
    return c.json({ error: 'gmail_send_failed', detail: text.slice(0, 300) }, 502)
  }

  const gmailData = (await gmailRes.json()) as GmailSendResponse

  // Backfill Gmail's threadId + messageId so reply detection can
  // correlate inbound messages against this send.
  await db
    .update(trackedEmails)
    .set({
      threadId: gmailData.threadId,
      messageId: gmailData.id,
    })
    .where(eq(trackedEmails.id, id))
    .run()

  createLogger({ env: c.env }).info('compose_sent', {
    userId,
    emailId: id,
    gmailMessageId: gmailData.id,
    threadId: gmailData.threadId,
    recipientCount: allAddresses.length,
    linkCount: originalLinks.length,
  })

  return c.json({
    ok: true,
    emailId: id,
    gmailMessageId: gmailData.id,
    threadId: gmailData.threadId,
  })
})

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

/**
 * GET /v1/compose/thread/:emailId — fetch reply context for a tracked
 * email. Resolves the tracked_emails.id to its Gmail threadId, then
 * uses the Gmail API to fetch the latest message in that thread. The
 * compose UI uses the returned fields to prefill To / Subject
 * (Re:-prefixed) / quoted body + wire In-Reply-To + References so the
 * outbound reply appears in the original thread on both sides.
 */
composeRouter.get('/thread/:emailId', async (c) => {
  const emailId = c.req.param('emailId')
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const email = await db
    .select({
      id: trackedEmails.id,
      userId: trackedEmails.userId,
      threadId: trackedEmails.threadId,
      subject: trackedEmails.subject,
      messageId: trackedEmails.messageId,
    })
    .from(trackedEmails)
    .where(eq(trackedEmails.id, emailId))
    .get()
  if (!email || email.userId !== userId) {
    return c.json({ error: 'not_found' }, 404)
  }
  if (!email.threadId) {
    return c.json({ error: 'no_thread_id' }, 400)
  }

  let accessToken: string
  try {
    const t = await getGoogleAccessToken(db, c.env, userId)
    accessToken = t.accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return c.json({ error: 'gmail_not_ready', reason: msg }, 400)
  }

  // Fetch the whole thread, then pick the most recent message.
  const threadRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
      email.threadId,
    )}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!threadRes.ok) {
    const detail = await threadRes.text()
    createLogger({ env: c.env }).warn('gmail_thread_fetch_failed', {
      userId,
      threadId: email.threadId,
      status: threadRes.status,
      detail: detail.slice(0, 200),
    })
    return c.json({ error: 'gmail_thread_fetch_failed', status: threadRes.status }, 502)
  }
  const thread = (await threadRes.json()) as GmailThread
  const messages = thread.messages ?? []
  if (messages.length === 0) {
    return c.json({ error: 'empty_thread' }, 404)
  }
  const latest = messages[messages.length - 1]!

  const headers = new Map<string, string>()
  for (const h of latest.payload?.headers ?? []) {
    headers.set(h.name.toLowerCase(), h.value)
  }

  const fromHeader = headers.get('from') ?? ''
  const parsedFrom = parseAddressHeader(fromHeader)
  const subject = headers.get('subject') ?? email.subject ?? ''
  const messageIdHeader = headers.get('message-id') ?? ''
  const referencesHeader = headers.get('references') ?? ''

  const bodyText = extractPlainText(latest.payload) ?? ''
  const dateHeader = headers.get('date') ?? ''

  return c.json({
    threadId: email.threadId,
    inReplyToMessageId: messageIdHeader,
    references: referencesHeader,
    subject: prefixReSubject(subject),
    to: parsedFrom.address,
    fromName: parsedFrom.name,
    quotedBody: buildQuotedReply({
      dateHeader,
      fromDisplay: parsedFrom.name
        ? `${parsedFrom.name} <${parsedFrom.address}>`
        : parsedFrom.address,
      bodyText,
    }),
    originalSnippet: (latest.snippet ?? '').slice(0, 200),
  })
})

interface GmailThread {
  id: string
  messages?: GmailMessage[]
}

interface GmailMessage {
  id: string
  snippet?: string
  payload?: GmailPayload
}

interface GmailPayload {
  headers?: { name: string; value: string }[]
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPayload[]
}

/** Depth-first walk to find the first text/plain part in a Gmail
 *  message payload. Multipart messages nest text/plain +
 *  text/html + attachments; we pull text for the quoted reply. */
function extractPlainText(payload: GmailPayload | undefined): string | null {
  if (!payload) return null
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return b64UrlDecode(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = extractPlainText(part)
      if (found) return found
    }
  }
  // Fallback: strip HTML from text/html if no plain part.
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = b64UrlDecode(payload.body.data)
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return null
}

function b64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (s.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

/** RFC 5322 address parsing — good enough for the two common forms:
 *  bare `a@b.com` and `Name <a@b.com>`. Not RFC-strict but Gmail's
 *  header content is always well-formed. */
function parseAddressHeader(raw: string): { name: string; address: string } {
  const m = /^\s*(?:"?([^"<>]*?)"?\s*)?<\s*([^\s<>]+@[^\s<>]+)\s*>\s*$/.exec(raw)
  if (m) return { name: (m[1] ?? '').trim(), address: (m[2] ?? '').trim() }
  const bare = raw.trim()
  if (/^[^\s@]+@[^\s@]+$/.test(bare)) return { name: '', address: bare }
  return { name: '', address: bare }
}

function prefixReSubject(subject: string): string {
  if (/^re:/i.test(subject.trim())) return subject
  return `Re: ${subject}`
}

function buildQuotedReply(args: {
  dateHeader: string
  fromDisplay: string
  bodyText: string
}): string {
  const attribution = args.dateHeader
    ? `On ${args.dateHeader}, ${args.fromDisplay} wrote:`
    : `${args.fromDisplay} wrote:`
  const quoted = args.bodyText
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `\n\n${attribution}\n${quoted}`
}
