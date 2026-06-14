import { Hono } from 'hono'
import { verify } from '@mailfalcon/shared'

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET: string
  // DB: D1Database
  // KV: KVNamespace
  // ASSETS: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

const TRANSPARENT_GIF = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
])

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() }),
)

app.get('/p/:idWithExt', async (c) => {
  const sig = c.req.query('s') ?? ''
  const idWithExt = c.req.param('idWithExt')
  const id = idWithExt.replace(/\.gif$/, '')

  // Stub: signature verification. D1 write + push fanout lands in next commit.
  if (c.env.HMAC_SECRET) {
    await verify(id, sig, c.env.HMAC_SECRET, 12).catch(() => false)
  }

  return new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'private, no-store, must-revalidate',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
    },
  })
})

app.get('/c/:id/:linkIdx', async (c) => {
  const sig = c.req.query('s') ?? ''
  const id = c.req.param('id')
  const linkIdx = Number(c.req.param('linkIdx'))

  // Stub: real impl resolves links.original_url from D1.
  const fallback = 'https://mailfalcon.app'
  void sig
  void linkIdx

  // Avoid open-redirect: only redirect to a hardcoded fallback until DB is wired.
  return c.redirect(fallback, 302)
})

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
