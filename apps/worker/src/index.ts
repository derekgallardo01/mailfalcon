import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { adminMiddleware } from './lib/admin-middleware'
import { authMiddleware, type Variables } from './lib/auth-middleware'
import { createLogger, errorMeta } from './lib/logger'
import { adminRouter } from './routes/admin'
import { authRouter } from './routes/auth'
import { billingRouter } from './routes/billing'
import { clickRouter } from './routes/click'
import { emailsRouter } from './routes/emails'
import { eventsRouter } from './routes/events'
import { followupsRouter } from './routes/followups'
import { meRouter } from './routes/me'
import { pixelRouter } from './routes/pixel'
import { pushRouter } from './routes/push'
import { repliesRouter } from './routes/replies'
import { streamRouter } from './routes/stream'
import { stripeWebhookRouter } from './routes/stripe-webhook'
import { templatesRouter } from './routes/templates'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_ID_PRO?: string
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

app.use('/v1/*', authMiddleware)
app.use('/v1/admin/*', adminMiddleware)
app.route('/v1/me', meRouter)
app.route('/v1/admin', adminRouter)
app.route('/v1/emails', emailsRouter)
app.route('/v1/events', eventsRouter)
app.route('/v1/templates', templatesRouter)
app.route('/v1/followups', followupsRouter)
app.route('/v1/replies', repliesRouter)
app.route('/v1/push', pushRouter)
app.route('/v1/billing', billingRouter)

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

import { sendAdminDigests } from './lib/admin-digest'
import { cleanupStalePushSubs } from './lib/cron-cleanup'
import { sendDailyDigests } from './lib/digest'
import { getDb } from './lib/db'
import { evaluateFollowups } from './lib/followups'

export default {
  fetch: app.fetch,
  // Cron trigger: 22:00 UTC = 6pm Eastern. Runs both digest passes.
  async scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const log = createLogger({ env, waitUntil: (p) => ctx.waitUntil(p) })
    ctx.waitUntil(
      (async () => {
        const db = getDb(env.DB)
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
      })(),
    )
  },
}
