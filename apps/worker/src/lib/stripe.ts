import Stripe from 'stripe'

export function getStripe(env: { STRIPE_SECRET_KEY?: string }): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider()
