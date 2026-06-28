import { and, eq } from 'drizzle-orm'
import {
  eventWebhooks,
  notificationSubscriptions,
  users,
  workspaceMembers,
  workspaces,
} from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'
import { sendEventNotification, type EventNotificationKind } from './mailer'
import { isInQuietHours } from './quiet-hours'
import { sendPushEmpty } from './web-push'

interface PushEnv {
  ENVIRONMENT: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
  RESEND_API_KEY?: string
  PUBLIC_WEB_URL?: string
  KV?: KVNamespace
}

export type PushKind = 'open' | 'click' | 'reply' | 'hot-lead'

export interface PushPayload {
  kind: PushKind
  /** Short text to surface in Slack/Discord webhook formatting. The
   *  Web Push goes out empty — the SW pulls the event detail from the
   *  worker on receipt so we don't have to worry about payload size or
   *  encryption. Webhook integrations need the text inline though. */
  text?: string
  /** Used for the webhook formatter's title — typically the event's
   *  email subject. */
  subject?: string | null
  /** Used by the webhook formatter to deep-link back to the dashboard. */
  emailId?: string
  /** Human label for the event source (recipient email or contact
   *  name). Surfaces in webhook + email-to-self bodies. */
  recipientLabel?: string
  /** Optional geo string for email-to-self ("Miami, FL"). */
  location?: string
  /** Optional device/UA string for email-to-self ("Mobile · Safari"). */
  device?: string
}

/**
 * Fan out an empty Web Push to every subscription the user has +
 * forward to every enabled event-webhook (Slack/Discord). Prunes
 * subscriptions that come back gone (404/410). Errors are swallowed —
 * pushes are best-effort.
 */
export async function fanoutPush(
  db: DB,
  env: PushEnv,
  userId: string,
  payload: PushPayload = { kind: 'open' },
): Promise<{
  sent: number
  pruned: number
  webhookFired: number
  emailNotified: number
  suppressed?: 'quiet_hours'
}> {
  // Quiet hours: a single users-row read, then short-circuit if inside
  // the window. Saves the subs query + every push round-trip.
  // Also pulls the email-to-self gating: tier (Pro+ only), per-event
  // flags, and the user's own email + workspace tier for inheritance.
  const user = await db
    .select({
      email: users.email,
      tier: users.tier,
      trialEndsAt: users.trialEndsAt,
      quietStartMinute: users.quietStartMinute,
      quietEndMinute: users.quietEndMinute,
      quietTimezone: users.quietTimezone,
      emailNotifyOpen: users.emailNotifyOpen,
      emailNotifyClick: users.emailNotifyClick,
      emailNotifyReply: users.emailNotifyReply,
      emailNotifyHotLead: users.emailNotifyHotLead,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (user && isInQuietHours(user)) {
    return { sent: 0, pruned: 0, webhookFired: 0, emailNotified: 0, suppressed: 'quiet_hours' }
  }

  const subs = await db
    .select({
      id: notificationSubscriptions.id,
      endpoint: notificationSubscriptions.endpoint,
      p256dh: notificationSubscriptions.p256dh,
      auth: notificationSubscriptions.auth,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.userId, userId),
        subsPrefCondition(payload.kind),
      ),
    )
    .all()

  let sent = 0
  let pruned = 0

  const now = Date.now()
  if (subs.length > 0) {
    await Promise.all(
      subs.map(async (sub) => {
        try {
          const result = await sendPushEmpty(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            env,
          )
          if (result.ok) {
            sent++
            await db
              .update(notificationSubscriptions)
              .set({ lastSeenAt: now })
              .where(eq(notificationSubscriptions.id, sub.id))
              .run()
          }
          if (result.gone) {
            await db
              .delete(notificationSubscriptions)
              .where(eq(notificationSubscriptions.id, sub.id))
              .run()
            pruned++
          }
        } catch (err) {
          createLogger({ env }).warn('push_fanout_error', errorMeta(err))
        }
      }),
    )
  }

  // Event-webhook fan-out — Slack / Discord. Same per-event-type gate.
  const hooks = await db
    .select({
      id: eventWebhooks.id,
      url: eventWebhooks.url,
    })
    .from(eventWebhooks)
    .where(
      and(
        eq(eventWebhooks.userId, userId),
        eq(eventWebhooks.enabled, 1),
        hookPrefCondition(payload.kind),
      ),
    )
    .all()

  let webhookFired = 0
  if (hooks.length > 0) {
    await Promise.all(
      hooks.map(async (h) => {
        try {
          const status = await sendWebhook(h.url, payload)
          await db
            .update(eventWebhooks)
            .set({ lastFiredAt: now, lastStatus: status })
            .where(eq(eventWebhooks.id, h.id))
            .run()
          if (status.startsWith('2')) webhookFired++
        } catch (err) {
          createLogger({ env }).warn('webhook_fanout_error', errorMeta(err))
        }
      }),
    )
  }

  // Email-to-self fan-out. Gated by:
  //   - per-event-type flag on users (default off for open/click, on for
  //     reply/hot-lead — see migration 0014).
  //   - effective tier ≥ pro (trial counts as pro). Free users don't get
  //     the channel; would otherwise be an open Resend-bill vector.
  //   - per-(user, kind) KV rate limit: 20/hour, fail-open on KV write
  //     errors so we never silently drop on KV blips.
  let emailNotified = 0
  if (
    user &&
    env.RESEND_API_KEY &&
    emailNotifyEnabled(user, payload.kind)
  ) {
    const tierOk = await hasEffectiveProTier(db, user, userId)
    if (tierOk) {
      const allowed = await rateLimitEmailNotify(env, userId, payload.kind)
      if (allowed) {
        try {
          await sendEventNotification({
            to: user.email,
            kind: payload.kind as EventNotificationKind,
            subject: payload.subject ?? null,
            recipientLabel: payload.recipientLabel,
            location: payload.location,
            device: payload.device,
            emailId: payload.emailId,
            webUrl: env.PUBLIC_WEB_URL ?? 'https://app.mailfalcon.app',
            env,
          })
          emailNotified++
        } catch (err) {
          createLogger({ env }).warn('email_notify_send_failed', errorMeta(err))
        }
      } else {
        createLogger({ env }).info('email_notify_throttled', {
          userId,
          kind: payload.kind,
        })
      }
    }
  }

  return { sent, pruned, webhookFired, emailNotified }
}

/** Per-event-type flag check for email-to-self. */
function emailNotifyEnabled(
  user: {
    emailNotifyOpen: number
    emailNotifyClick: number
    emailNotifyReply: number
    emailNotifyHotLead: number
  },
  kind: PushKind,
): boolean {
  switch (kind) {
    case 'open':
      return user.emailNotifyOpen === 1
    case 'click':
      return user.emailNotifyClick === 1
    case 'reply':
      return user.emailNotifyReply === 1
    case 'hot-lead':
      return user.emailNotifyHotLead === 1
  }
}

const TIER_RANK: Record<string, number> = {
  admin: 4,
  team: 3,
  pro: 2,
  free: 1,
}

/** Effective tier: own tier OR strongest workspace-owner tier OR pro if
 *  the trial is active. Mirrors /v1/me's tier-inheritance + trial-layer
 *  logic. Returns true when the resulting tier is pro or better.
 *
 *  Tier inheritance walks every workspace the user is a member of —
 *  fanout fires outside the request lifecycle so we don't have an
 *  "active workspace" hint to lean on. */
async function hasEffectiveProTier(
  db: DB,
  user: { tier: string; trialEndsAt: number | null },
  userId: string,
): Promise<boolean> {
  const ownRank = TIER_RANK[user.tier] ?? 0
  if (ownRank >= TIER_RANK.pro!) return true
  if (user.trialEndsAt != null && user.trialEndsAt > Date.now()) return true

  const ownerTiers = await db
    .select({ tier: users.tier })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaces.ownerId))
    .where(eq(workspaceMembers.userId, userId))
    .all()
  for (const row of ownerTiers) {
    const r = TIER_RANK[row.tier] ?? 0
    if (r >= TIER_RANK.pro!) return true
  }
  return false
}

/** KV-backed rate limit: 20 sends per (user, kind) per rolling hour
 *  bucket. The bucket key includes a floor(now/3600000) hour token so
 *  it auto-rolls without explicit TTL bookkeeping. Fail-open on any KV
 *  error — we'd rather over-send than silently drop. */
async function rateLimitEmailNotify(
  env: PushEnv,
  userId: string,
  kind: PushKind,
): Promise<boolean> {
  if (!env.KV) return true
  const hourBucket = Math.floor(Date.now() / 3_600_000)
  const key = `email-notify:${userId}:${kind}:${hourBucket}`
  try {
    const cur = await env.KV.get(key)
    const n = cur ? parseInt(cur, 10) : 0
    if (Number.isFinite(n) && n >= 20) return false
    await env.KV.put(key, String(n + 1), { expirationTtl: 3600 })
    return true
  } catch {
    return true
  }
}

/** Per-event-type gating expressions. Returning a drizzle SQL
 *  expression dodges the literal-name column-type mismatch we'd hit if
 *  we tried to return columns as a discriminated union. */
function subsPrefCondition(kind: PushKind) {
  switch (kind) {
    case 'click':
      return eq(notificationSubscriptions.notifyClick, 1)
    case 'reply':
      return eq(notificationSubscriptions.notifyReply, 1)
    case 'hot-lead':
      return eq(notificationSubscriptions.notifyHotLead, 1)
    case 'open':
    default:
      return eq(notificationSubscriptions.notifyOpen, 1)
  }
}

function hookPrefCondition(kind: PushKind) {
  switch (kind) {
    case 'click':
      return eq(eventWebhooks.notifyClick, 1)
    case 'reply':
      return eq(eventWebhooks.notifyReply, 1)
    case 'hot-lead':
      return eq(eventWebhooks.notifyHotLead, 1)
    case 'open':
    default:
      return eq(eventWebhooks.notifyOpen, 1)
  }
}

/** Detects Slack vs Discord by URL pattern and POSTs the appropriately-
 *  formatted payload. Both accept a simple `text` field, but Discord
 *  expects `content` and Slack expects `text`. Slack also supports
 *  Block Kit; we use the simple text form for now. */
async function sendWebhook(url: string, payload: PushPayload): Promise<string> {
  const isDiscord = url.includes('discord.com/api/webhooks')
  const title =
    payload.kind === 'hot-lead'
      ? '🔥 Hot lead'
      : payload.kind === 'open'
      ? '📬 Open'
      : payload.kind === 'click'
      ? '🖱 Click'
      : '↩️ Reply'
  const subject = payload.subject ? `: *${escapeMarkdown(payload.subject)}*` : ''
  const text = payload.text
    ? `${title}${subject}\n${escapeMarkdown(payload.text)}`
    : `${title}${subject}`
  const body = isDiscord ? { content: text } : { text }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return String(res.status)
}

function escapeMarkdown(s: string): string {
  // Strip control chars + escape mention markers that could
  // accidentally ping channels.
  return s.replace(/[<>@&]/g, '').slice(0, 500)
}
