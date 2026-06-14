import { SignJWT, importJWK } from 'jose'

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

interface VapidEnv {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY_JWK?: string
  VAPID_SUBJECT?: string
}

function isVapidConfigured(env: VapidEnv): boolean {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY_JWK && env.VAPID_SUBJECT)
}

async function buildVapidAuth(endpoint: string, env: VapidEnv): Promise<string> {
  const url = new URL(endpoint)
  const aud = `${url.protocol}//${url.host}`
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY_JWK!) as Record<string, string>
  const key = await importJWK(jwk, 'ES256')

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setAudience(aud)
    .setSubject(env.VAPID_SUBJECT!)
    .setExpirationTime('12h')
    .sign(key)

  return `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`
}

/**
 * Sends an empty Web Push notification to a single subscription. The SW
 * on the receiving end is expected to wake up, fetch the latest events,
 * and call chrome.notifications.create(). We avoid payload encryption
 * (aes128gcm + ECDH) to keep the worker bundle small.
 *
 * Returns true on accept (201/202/204), false on gone (404/410) so the
 * caller can prune the subscription.
 */
export async function sendPushEmpty(
  sub: PushSubscription,
  env: VapidEnv,
): Promise<{ ok: boolean; gone: boolean; status: number }> {
  if (!isVapidConfigured(env)) {
    return { ok: false, gone: false, status: 0 }
  }
  const auth = await buildVapidAuth(sub.endpoint, env)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      TTL: '60',
      'Content-Length': '0',
      Urgency: 'normal',
    },
  })
  return {
    ok: res.status >= 200 && res.status < 300,
    gone: res.status === 404 || res.status === 410,
    status: res.status,
  }
}
