import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { subscriptions, users } from '@mailfalcon/db/schema'
import { getDb } from '../lib/db'
import { createLogger, errorMeta } from '../lib/logger'
import { getStripe, stripeCryptoProvider } from '../lib/stripe'

type Bindings = {
  ENVIRONMENT: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  DB: D1Database
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export const stripeWebhookRouter = new Hono<{ Bindings: Bindings }>()

stripeWebhookRouter.post('/', async (c) => {
  const stripe = getStripe(c.env)
  const secret = c.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return c.json({ error: 'stripe_not_configured' }, 503)

  const sig = c.req.header('Stripe-Signature')
  if (!sig) return c.json({ error: 'missing_signature' }, 400)
  const rawBody = await c.req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      secret,
      undefined,
      stripeCryptoProvider,
    )
  } catch (err) {
    createLogger({ env: c.env }).error(
      'stripe_webhook_sig_check_failed',
      errorMeta(err),
    )
    return c.json({ error: 'invalid_signature' }, 400)
  }

  const db = getDb(c.env.DB)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = session.client_reference_id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      if (userId && customerId) {
        await db
          .update(users)
          .set({ stripeCustId: customerId, tier: 'pro' })
          .where(eq(users.id, userId))
          .run()
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const userId = (sub.metadata?.userId as string | undefined) ?? null
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const tier = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free'

      // Stripe moved current_period_end between API versions; check both.
      const subAny = sub as unknown as {
        current_period_end?: number
        items?: { data?: { current_period_end?: number }[] }
      }
      const periodEndSec =
        subAny.current_period_end ?? subAny.items?.data?.[0]?.current_period_end ?? 0
      const currentPeriodEnd = periodEndSec * 1000

      if (userId) {
        await db
          .update(users)
          .set({ stripeCustId: customerId, tier })
          .where(eq(users.id, userId))
          .run()
      } else {
        await db
          .update(users)
          .set({ tier })
          .where(eq(users.stripeCustId, customerId))
          .run()
      }

      await db
        .insert(subscriptions)
        .values({
          id: sub.id,
          userId: userId ?? 'unknown',
          stripeSubId: sub.id,
          status: sub.status,
          currentPeriodEnd,
          tier: 'pro',
        })
        .onConflictDoUpdate({
          target: subscriptions.id,
          set: {
            status: sub.status,
            currentPeriodEnd,
          },
        })
        .run()
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      await db
        .update(users)
        .set({ tier: 'free' })
        .where(eq(users.stripeCustId, customerId))
        .run()
      await db
        .update(subscriptions)
        .set({ status: 'canceled' })
        .where(eq(subscriptions.stripeSubId, sub.id))
        .run()
      break
    }
    default:
      // Ignore other events
      break
  }

  return c.json({ received: true })
})
