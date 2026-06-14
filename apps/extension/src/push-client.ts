import { getSession } from './auth-store'
import { config } from './config'

function urlBase64ToUint8Array(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bufToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const u8 = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function swSelf(): ServiceWorkerGlobalScope | null {
  const g = self as unknown as {
    registration?: ServiceWorkerRegistration
  }
  if (!g.registration) return null
  return self as unknown as ServiceWorkerGlobalScope
}

export async function ensurePushSubscription(): Promise<void> {
  const session = await getSession()
  if (!session) return

  const sw = swSelf()
  if (!sw?.registration?.pushManager) {
    console.warn('[mailfalcon] pushManager unavailable on this SW')
    return
  }

  let sub = await sw.registration.pushManager.getSubscription()
  if (!sub) {
    const pubKey = await fetch(`${config.apiHost}/vapid-public-key`).then((r) =>
      r.text(),
    )
    if (!pubKey) {
      console.warn('[mailfalcon] VAPID public key unavailable; skipping push subscribe')
      return
    }
    try {
      const keyBytes = urlBase64ToUint8Array(pubKey)
      sub = await sw.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer as ArrayBuffer,
      })
    } catch (err) {
      console.warn('[mailfalcon] push subscribe failed:', err)
      return
    }
  }

  await fetch(`${config.apiHost}/v1/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: bufToB64Url(sub.getKey('p256dh')),
      auth: bufToB64Url(sub.getKey('auth')),
      ua: navigator.userAgent,
    }),
  }).catch((err) => console.warn('[mailfalcon] push subscribe POST failed:', err))
}

export async function dropPushSubscription(): Promise<void> {
  const session = await getSession()
  const sw = swSelf()
  const sub = await sw?.registration?.pushManager?.getSubscription()
  if (sub) {
    await fetch(`${config.apiHost}/v1/push/subscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined)
    await sub.unsubscribe().catch(() => undefined)
  }
}
