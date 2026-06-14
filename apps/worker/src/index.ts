import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware, type Variables } from './lib/auth-middleware'
import { authRouter } from './routes/auth'
import { clickRouter } from './routes/click'
import { emailsRouter } from './routes/emails'
import { pixelRouter } from './routes/pixel'
import { streamRouter } from './routes/stream'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
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

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() }),
)

app.route('/auth', authRouter)

app.use('/v1/*', authMiddleware)
app.route('/v1/emails', emailsRouter)

// /stream is outside the /v1/* auth-middleware namespace because
// EventSource can't send Authorization headers; the stream router does
// its own JWT-via-query-string auth.
app.use(
  '/stream',
  cors({
    origin: originPolicy,
    credentials: false,
  }),
)
app.route('/stream', streamRouter)

app.route('/p', pixelRouter)
app.route('/c', clickRouter)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
