import { Hono } from 'hono'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { subscriptions, users } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getStripe } from '../lib/stripe'

type Bindings = {
  ENVIRONMENT: string
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID_PRO?: string
  STRIPE_PRICE_ID_TEAM?: string
  DB: D1Database
  PUBLIC_WEB_URL?: string
}

const checkoutSchema = z.object({
  tier: z.enum(['pro', 'team']).default('pro'),
})

export const billingRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

function webUrl(env: Bindings): string {
  return env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
}

billingRouter.post('/checkout', async (c) => {
  const stripe = getStripe(c.env)
  if (!stripe) return c.json({ error: 'stripe_not_configured' }, 503)

  const body = await c.req.json().catch(() => ({}))
  const parsed = checkoutSchema.safeParse(body ?? {})
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const priceId =
    parsed.data.tier === 'team'
      ? c.env.STRIPE_PRICE_ID_TEAM
      : c.env.STRIPE_PRICE_ID_PRO
  if (!priceId) return c.json({ error: 'price_not_configured' }, 503)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      stripeCustId: users.stripeCustId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) return c.json({ error: 'user_not_found' }, 404)

  const base = webUrl(c.env)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    customer: user.stripeCustId ?? undefined,
    customer_email: user.stripeCustId ? undefined : user.email,
    success_url: `${base}/dashboard?upgraded=1`,
    cancel_url: `${base}/dashboard?upgraded=0`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId, tier: parsed.data.tier } },
  })

  return c.json({ url: session.url })
})

/**
 * GET /v1/billing/subscription — current subscription state for the
 * caller. Used by Settings → Subscription panel. Returns null if no
 * active row, otherwise the most recent subscription (by
 * currentPeriodEnd).
 */
billingRouter.get('/subscription', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      id: subscriptions.id,
      stripeSubId: subscriptions.stripeSubId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      tier: subscriptions.tier,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1)
    .get()
  return c.json({ subscription: row ?? null })
})

billingRouter.post('/portal', async (c) => {
  const stripe = getStripe(c.env)
  if (!stripe) return c.json({ error: 'stripe_not_configured' }, 503)

  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const user = await db
    .select({ stripeCustId: users.stripeCustId })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user?.stripeCustId) {
    return c.json({ error: 'no_customer' }, 400)
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustId,
    return_url: `${webUrl(c.env)}/dashboard`,
  })

  return c.json({ url: session.url })
})
