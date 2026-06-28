import { and, eq } from 'drizzle-orm'
import {
  eventWebhooks,
  notificationSubscriptions,
  users,
} from '@mailfalcon/db/schema'
import type { DB } from './db'
import { createLogger, errorMeta } from './logger'
import { isInQuietHours } from './quiet-hours'
import { sendPushEmpty } from './web-push'

interface PushEnv {
  ENVIRONMENT: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
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
): Promise<{ sent: number; pruned: number; webhookFired: number; suppressed?: 'quiet_hours' }> {
  // Quiet hours: a single users-row read, then short-circuit if inside
  // the window. Saves the subs query + every push round-trip.
  const user = await db
    .select({
      quietStartMinute: users.quietStartMinute,
      quietEndMinute: users.quietEndMinute,
      quietTimezone: users.quietTimezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (user && isInQuietHours(user)) {
    return { sent: 0, pruned: 0, webhookFired: 0, suppressed: 'quiet_hours' }
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

  return { sent, pruned, webhookFired }
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
