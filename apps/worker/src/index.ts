import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { adminMiddleware } from './lib/admin-middleware'
import { authMiddleware, type Variables } from './lib/auth-middleware'
import { createLogger, errorMeta } from './lib/logger'
import { adminRouter } from './routes/admin'
import { authRouter } from './routes/auth'
import { billingRouter } from './routes/billing'
import { clickRouter } from './routes/click'
import { composeRouter } from './routes/compose'
import { contactsRouter } from './routes/contacts'
import { emailsRouter } from './routes/emails'
import { eventsRouter } from './routes/events'
import { extensionRouter } from './routes/extension'
import { followupsRouter } from './routes/followups'
import { meRouter } from './routes/me'
import { oauthRouter } from './routes/oauth'
import { pixelRouter } from './routes/pixel'
import { pushRouter } from './routes/push'
import { repliesRouter } from './routes/replies'
import { scheduledRouter } from './routes/scheduled'
import { streamRouter } from './routes/stream'
import { stripeWebhookRouter } from './routes/stripe-webhook'
import { customDomainRouter } from './routes/custom-domain'
import { templatesRouter } from './routes/templates'
import { webhooksRouter } from './routes/webhooks'
import { workspacesRouter } from './routes/workspaces'
import { eq } from 'drizzle-orm'
import {
  users as usersTable,
  workspaceInvites,
  workspaces as workspacesTable,
} from '@mailfalcon/db/schema'
import { getDb } from './lib/db'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_ID_PRO?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  PUBLIC_WEB_URL?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
  DB: D1Database
  KV: KVNamespace
  ASSETS: R2Bucket
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function originPolicy(origin: string | undefined): string {
  if (!origin) return ''
  if (origin === 'https://mail.google.com') return origin
  if (origin === 'https://app.mailfalcon.app') return origin
  if (origin.startsWith('chrome-extension://')) return origin
  if (origin.startsWith('http://localhost')) return origin
  return ''
}

app.use(
  '/v1/*',
  cors({
    origin: originPolicy,
    credentials: false,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

app.use(
  '/auth/*',
  cors({
    origin: originPolicy,
    credentials: false,
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

// CORS for the unauthed VAPID public key endpoint.
app.use(
  '/vapid-public-key',
  cors({ origin: originPolicy, credentials: false }),
)

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() }),
)

app.get('/vapid-public-key', (c) =>
  c.text(c.env.VAPID_PUBLIC_KEY ?? '', 200, { 'Cache-Control': 'public, max-age=300' }),
)

app.route('/auth', authRouter)

// Unauthed invite preview — the /workspaces/accept web page calls this
// to show "X invited you to Workspace Y" before the user has signed in.
app.use(
  '/workspace-invites/*',
  cors({ origin: originPolicy, credentials: false }),
)
app.get('/workspace-invites/:token', async (c) => {
  const token = c.req.param('token')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      workspaceName: workspacesTable.name,
      inviterEmail: usersTable.email,
      email: workspaceInvites.email,
      expiresAt: workspaceInvites.expiresAt,
      acceptedAt: workspaceInvites.acceptedAt,
    })
    .from(workspaceInvites)
    .innerJoin(workspacesTable, eq(workspacesTable.id, workspaceInvites.workspaceId))
    .innerJoin(usersTable, eq(usersTable.id, workspaceInvites.invitedBy))
    .where(eq(workspaceInvites.id, token))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.acceptedAt != null) return c.json({ error: 'already_accepted' }, 410)
  if (row.expiresAt < Date.now()) return c.json({ error: 'expired' }, 410)
  return c.json({
    workspaceName: row.workspaceName,
    inviterEmail: row.inviterEmail,
    inviteEmail: row.email,
  })
})

app.use('/v1/*', authMiddleware)
app.use('/v1/admin/*', adminMiddleware)
app.route('/v1/me', meRouter)
app.route('/v1/admin', adminRouter)
app.route('/v1/emails', emailsRouter)
app.route('/v1/contacts', contactsRouter)
app.route('/v1/events', eventsRouter)
app.route('/v1/templates', templatesRouter)
app.route('/v1/followups', followupsRouter)
app.route('/v1/replies', repliesRouter)
app.route('/v1/scheduled', scheduledRouter)
app.route('/v1/compose', composeRouter)
app.route('/v1/push', pushRouter)
app.route('/v1/billing', billingRouter)
app.route('/v1/oauth', oauthRouter)
app.route('/v1/workspaces', workspacesRouter)
app.route('/v1/extension', extensionRouter)
app.route('/v1/webhooks', webhooksRouter)
app.route('/v1/me/custom-domain', customDomainRouter)

app.use(
  '/stream',
  cors({
    origin: originPolicy,
    credentials: false,
  }),
)
app.route('/stream', streamRouter)

app.route('/stripe/webhook', stripeWebhookRouter)

app.route('/p', pixelRouter)
app.route('/c', clickRouter)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((err, c) => {
  const log = createLogger({
    env: c.env,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  })
  log.error('unhandled_error', {
    path: c.req.path,
    method: c.req.method,
    ...errorMeta(err),
  })
  return c.json({ error: 'internal' }, 500)
})

import { sendActivationEmails } from './lib/activation-emails'
import { sendAdminDigests } from './lib/admin-digest'
import { cleanupOldScheduledSends, cleanupStalePushSubs } from './lib/cron-cleanup'
import { sendDailyDigests } from './lib/digest'
import { evaluateFollowups } from './lib/followups'
import { evaluateHotLeads } from './lib/hot-leads'
import { sendMiddayDigests } from './lib/midday-digest'

export default {
  fetch: app.fetch,
  /**
   * Crons:
   *   - `0 22 * * *` (22:00 UTC = 6pm ET) — daily digests, followups,
   *     stale push cleanup. The legacy "big nightly job".
   *   - `*\/10 * * * *` (every 10 min) — activation playbook: welcome
   *     emails ~5min after install + 3-day reminders. Lightweight; just
   *     one targeted SELECT + per-row UPDATE.
   *
   * The function dispatches by the cron expression so each schedule
   * only does what it needs to.
   */
  async scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const log = createLogger({ env, waitUntil: (p) => ctx.waitUntil(p) })
    const db = getDb(env.DB)

    // 17:00 UTC = 1pm ET — mid-day digest.
    if (event.cron === '0 17 * * *') {
      ctx.waitUntil(
        (async () => {
          try {
            const out = await sendMiddayDigests(db, env)
            log.info('cron_midday_digest', { cron: event.cron, ...out })
          } catch (err) {
            log.error('cron_midday_digest_failed', errorMeta(err))
          }
        })(),
      )
      return
    }

    // Hot-lead evaluator runs every 15 minutes.
    if (event.cron === '*/15 * * * *') {
      ctx.waitUntil(
        (async () => {
          try {
            const out = await evaluateHotLeads(db, env)
            log.info('cron_hot_leads', { cron: event.cron, ...out })
          } catch (err) {
            log.error('cron_hot_leads_failed', errorMeta(err))
          }
        })(),
      )
      return
    }

    // Activation-emails cron runs every 10 minutes.
    if (event.cron === '*/10 * * * *') {
      ctx.waitUntil(
        (async () => {
          try {
            const out = await sendActivationEmails(db, env)
            log.info('cron_activation_emails', { cron: event.cron, ...out })
          } catch (err) {
            log.error('cron_activation_emails_failed', errorMeta(err))
          }
        })(),
      )
      return
    }

    ctx.waitUntil(
      (async () => {
        try {
          const user = await sendDailyDigests(db, env)
          log.info('cron_user_digest', { cron: event.cron, ...user })
        } catch (err) {
          log.error('cron_user_digest_failed', errorMeta(err))
        }
        try {
          const admin = await sendAdminDigests(db, env)
          log.info('cron_admin_digest', { cron: event.cron, ...admin })
        } catch (err) {
          log.error('cron_admin_digest_failed', errorMeta(err))
        }
        try {
          const fu = await evaluateFollowups(db, env)
          log.info('cron_followups', { cron: event.cron, ...fu })
        } catch (err) {
          log.error('cron_followups_failed', errorMeta(err))
        }
        try {
          const cleanup = await cleanupStalePushSubs(db, env)
          log.info('cron_push_cleanup', { cron: event.cron, ...cleanup })
        } catch (err) {
          log.error('cron_push_cleanup_failed', errorMeta(err))
        }
        try {
          const cleanup = await cleanupOldScheduledSends(db, env)
          log.info('cron_scheduled_cleanup', { cron: event.cron, ...cleanup })
        } catch (err) {
          log.error('cron_scheduled_cleanup_failed', errorMeta(err))
        }
      })(),
    )
  },
}
