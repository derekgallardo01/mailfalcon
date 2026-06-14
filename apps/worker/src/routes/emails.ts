import { Hono } from 'hono'
import { z } from 'zod'
import { newTrackingId, sign } from '@mailfalcon/shared'

const requestSchema = z.object({
  recipientCount: z.number().int().min(0).max(500),
  linkCount: z.number().int().min(0).max(500).default(0),
})

type Bindings = {
  ENVIRONMENT: string
  HMAC_SECRET?: string
}

const DEV_FALLBACK_SECRET = 'mailfalcon-dev-insecure'

export const emailsRouter = new Hono<{ Bindings: Bindings }>()

emailsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const secret = c.env.HMAC_SECRET ?? DEV_FALLBACK_SECRET
  if (secret === DEV_FALLBACK_SECRET) {
    console.warn('[mailfalcon] HMAC_SECRET unset; using dev fallback')
  }

  const id = newTrackingId()
  const sig = await sign(id, secret, 12)

  // TODO(auth): require JWT, attach userId
  // TODO(persistence): INSERT into tracked_emails + links in D1
  // TODO(freemium): check usage_counters in KV, 429 if over cap

  return c.json({ id, sig })
})
