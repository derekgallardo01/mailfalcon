import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { clickRouter } from './routes/click'
import { emailsRouter } from './routes/emails'
import { pixelRouter } from './routes/pixel'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  DB: D1Database
  KV: KVNamespace
  ASSETS: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(
  '/v1/*',
  cors({
    origin: (origin) => {
      if (!origin) return ''
      if (origin === 'https://mail.google.com') return origin
      if (origin === 'https://app.mailfalcon.app') return origin
      if (origin.startsWith('chrome-extension://')) return origin
      if (origin.startsWith('http://localhost')) return origin
      return ''
    },
    credentials: false,
  }),
)

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() }),
)

app.route('/v1/emails', emailsRouter)
app.route('/p', pixelRouter)
app.route('/c', clickRouter)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
