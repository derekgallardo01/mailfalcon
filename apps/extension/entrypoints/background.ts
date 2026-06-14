import { getSession } from '../src/auth-store'
import { config } from '../src/config'
import { dropPushSubscription, ensurePushSubscription } from '../src/push-client'
import { StreamClient, type StreamEvent } from '../src/stream-client'

const NOTIF_PREFIX = 'mf-event-'
const NOTIF_ICON_PATH = 'icon/128.png'
const PUSH_FETCH_KEY = 'mf.lastPushFetchTs'

type Notif = { title: string; body: string }

function notifFor(ev: StreamEvent): Notif {
  if (ev.type === 'open') {
    return {
      title: 'MailFalcon — email opened',
      body: ev.isFirstOpen ? 'First open detected' : 'Opened again',
    }
  }
  return {
    title: 'MailFalcon — link clicked',
    body: 'A tracked link was clicked',
  }
}

export default defineBackground(() => {
  console.log('[mailfalcon] background service worker started')

  let client: StreamClient | null = null

  async function start(): Promise<void> {
    const session = await getSession()
    if (!session) {
      stop()
      return
    }
    await ensurePushSubscription().catch((err) =>
      console.warn('[mailfalcon] push subscribe failed:', err),
    )
    if (client) return
    client = new StreamClient(session.token, sseHandler)
    client.start()
  }

  function stop(): void {
    client?.stop()
    client = null
    void dropPushSubscription().catch(() => undefined)
  }

  // SSE-delivered events (in-browser, dashboard/Gmail-tab open) use the
  // chrome.notifications API since they aren't Web-Push-spec-bound.
  function sseHandler(ev: StreamEvent): void {
    if (client) client.noteEventTs(ev.ts)
    if (ev.uaClass === 'bot') return

    const { title, body } = notifFor(ev)
    chrome.notifications.create(`${NOTIF_PREFIX}${ev.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIF_ICON_PATH),
      title,
      message: body,
      priority: 1,
    })
  }

  // Push-delivered events MUST call self.registration.showNotification()
  // for every push event, or the browser falls back to a "This site was
  // updated in the background" placeholder (Web Push userVisibleOnly).
  async function pushHandler(): Promise<void> {
    const sw = self as unknown as ServiceWorkerGlobalScope
    const session = await getSession()
    if (!session) {
      await sw.registration.showNotification('MailFalcon', {
        body: 'Sign in to see new activity.',
        icon: NOTIF_ICON_PATH,
        tag: 'mf-signed-out',
      })
      return
    }

    const stored = await chrome.storage.local.get(PUSH_FETCH_KEY)
    const lastTs = stored[PUSH_FETCH_KEY] as number | undefined
    const since = lastTs ?? Date.now() - 5 * 60 * 1000

    let recent: StreamEvent[] = []
    try {
      const res = await fetch(
        `${config.apiHost}/v1/events/recent?since=${since}`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      )
      if (res.ok) {
        const data = (await res.json()) as { events: StreamEvent[] }
        recent = data.events ?? []
      }
    } catch (err) {
      console.warn('[mailfalcon] /v1/events/recent fetch failed:', err)
    }

    const surfaced: StreamEvent[] = []
    let maxTs = since
    for (const ev of recent) {
      if (ev.ts > maxTs) maxTs = ev.ts
      if (ev.uaClass === 'bot') continue
      surfaced.push(ev)
    }

    if (surfaced.length === 0) {
      // Still must show one notification to satisfy Web Push spec.
      await sw.registration.showNotification('MailFalcon — new activity', {
        body: 'Open the dashboard to see what changed.',
        icon: NOTIF_ICON_PATH,
        tag: 'mf-push-generic',
        data: { url: 'https://app.mailfalcon.app/dashboard' },
      })
    } else {
      // Show one notification per event so users can see what happened.
      for (const ev of surfaced) {
        const { title, body } = notifFor(ev)
        await sw.registration.showNotification(title, {
          body,
          icon: NOTIF_ICON_PATH,
          tag: `${NOTIF_PREFIX}${ev.id}`,
          data: { url: 'https://app.mailfalcon.app/dashboard' },
        })
      }
    }

    await chrome.storage.local.set({ [PUSH_FETCH_KEY]: maxTs })
  }

  ;(self as unknown as ServiceWorkerGlobalScope).addEventListener('push', (event) => {
    event.waitUntil(pushHandler())
  })

  // Notifications shown via registration.showNotification surface through
  // notificationclick (not chrome.notifications.onClicked).
  ;(self as unknown as ServiceWorkerGlobalScope).addEventListener(
    'notificationclick',
    (event) => {
      const url =
        (event.notification.data as { url?: string } | undefined)?.url ??
        'https://app.mailfalcon.app/dashboard'
      event.notification.close()
      event.waitUntil(
        (async () => {
          await chrome.tabs.create({ url })
        })(),
      )
    },
  )

  chrome.runtime.onStartup.addListener(() => {
    void start()
  })
  chrome.runtime.onInstalled.addListener(() => {
    void start()
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return false

    if (msg.type === 'signed-in') {
      void start()
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'signed-out') {
      stop()
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'get-session') {
      void getSession()
        .then((session) => sendResponse({ session }))
        .catch(() => sendResponse({ session: null }))
      return true
    }
    if (msg.type === 'inboxsdk__injectPageWorld' && _sender.tab?.id != null) {
      const target: chrome.scripting.InjectionTarget = { tabId: _sender.tab.id }
      if (_sender.documentId) {
        target.documentIds = [_sender.documentId]
      } else if (_sender.frameId != null) {
        target.frameIds = [_sender.frameId]
      }
      chrome.scripting
        .executeScript({ target, world: 'MAIN', files: ['pageWorld.js'] })
        .catch((err) => console.warn('[mailfalcon] pageWorld inject failed:', err))
      sendResponse(true)
      return false
    }
    return false
  })

  // Legacy chrome.notifications click handler (still fires for SSE-driven
  // notifications shown via chrome.notifications.create).
  chrome.notifications.onClicked.addListener((notifId) => {
    if (!notifId.startsWith(NOTIF_PREFIX)) return
    chrome.tabs.create({ url: 'https://app.mailfalcon.app/dashboard' })
    chrome.notifications.clear(notifId)
  })

  void start()
})
