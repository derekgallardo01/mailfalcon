import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { emailsRouter } from './routes/emails'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
  // DB: D1Database
  // KV: KVNamespace
  // ASSETS: R2Bucket
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

const TRANSPARENT_GIF = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
])

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() }),
)

app.route('/v1/emails', emailsRouter)

app.get('/p/:idWithExt', async (c) => {
  // TODO: HMAC verify, KV nonce dedupe, D1 events insert, Web Push fanout
  return new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'private, no-store, must-revalidate',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
    },
  })
})

app.get('/c/:id/:linkIdx', async (c) => {
  // TODO: HMAC verify, D1 events insert, lookup links.original_url, redirect
  return c.redirect('https://mailfalcon.app', 302)
})

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
