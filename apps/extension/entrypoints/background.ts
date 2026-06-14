import { getSession } from '../src/auth-store'
import { config } from '../src/config'
import { dropPushSubscription, ensurePushSubscription } from '../src/push-client'
import { StreamClient, type StreamEvent } from '../src/stream-client'

const NOTIF_PREFIX = 'mf-event-'
const NOTIF_ICON_PATH = 'icon/128.png'
const PUSH_FETCH_KEY = 'mf.lastPushFetchTs'

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
    client = new StreamClient(session.token, handleEvent)
    client.start()
  }

  function stop(): void {
    client?.stop()
    client = null
    void dropPushSubscription().catch(() => undefined)
  }

  function handleEvent(ev: StreamEvent): void {
    if (client) client.noteEventTs(ev.ts)
    if (ev.uaClass === 'bot') return

    const title =
      ev.type === 'open' ? 'mailfalcon — email opened' : 'mailfalcon — link clicked'
    const message =
      ev.type === 'open'
        ? ev.isFirstOpen
          ? 'First open detected'
          : 'Opened again'
        : 'A tracked link was clicked'

    chrome.notifications.create(`${NOTIF_PREFIX}${ev.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIF_ICON_PATH),
      title,
      message,
      priority: 1,
    })
  }

  // Web Push wakes the SW even when no Gmail tab is open. We don't
  // carry a payload (avoids aes128gcm encryption); the SW pulls the
  // recent-events endpoint and surfaces any new ones.
  ;(self as unknown as ServiceWorkerGlobalScope).addEventListener('push', (event) => {
    event.waitUntil(
      (async () => {
        const session = await getSession()
        if (!session) return

        const last = (await chrome.storage.local
          .get(PUSH_FETCH_KEY)
          .then((v) => v[PUSH_FETCH_KEY] as number | undefined))
        const since = last ?? Date.now() - 5 * 60 * 1000

        const res = await fetch(
          `${config.apiHost}/v1/events/recent?since=${since}`,
          { headers: { Authorization: `Bearer ${session.token}` } },
        )
        if (!res.ok) return
        const { events: recent } = (await res.json()) as {
          events: StreamEvent[]
        }

        let maxTs = since
        for (const ev of recent) {
          if (ev.ts > maxTs) maxTs = ev.ts
          if (ev.uaClass === 'bot') continue
          handleEvent(ev)
        }
        await chrome.storage.local.set({ [PUSH_FETCH_KEY]: maxTs })
      })(),
    )
  })

  chrome.runtime.onStartup.addListener(() => {
    void start()
  })
  chrome.runtime.onInstalled.addListener(() => {
    void start()
  })

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

    // Content scripts ask the SW for the active session — chrome.storage
    // isn't reliably reachable from InboxSDK's presending callbacks
    // (they often resolve in a context where the chrome.storage global
    // is missing). The SW always has access, so it's the source of
    // truth.
    if (msg.type === 'get-session') {
      void getSession()
        .then((session) => sendResponse({ session }))
        .catch(() => sendResponse({ session: null }))
      return true // keep the channel open for the async reply
    }

    // InboxSDK MV3 bootstrap: content script asks us to inject pageWorld.js
    // into the page's main world. We can't do this from the content script
    // directly under MV3, so InboxSDK hands it off to the SW.
    if (msg.type === 'inboxsdk__injectPageWorld' && sender.tab?.id != null) {
      const target: chrome.scripting.InjectionTarget = { tabId: sender.tab.id }
      if (sender.documentId) {
        target.documentIds = [sender.documentId]
      } else if (sender.frameId != null) {
        target.frameIds = [sender.frameId]
      }
      chrome.scripting
        .executeScript({
          target,
          world: 'MAIN',
          files: ['pageWorld.js'],
        })
        .catch((err) => console.warn('[mailfalcon] pageWorld inject failed:', err))
      sendResponse(true)
      return false
    }

    return false
  })

  chrome.notifications.onClicked.addListener((notifId) => {
    if (!notifId.startsWith(NOTIF_PREFIX)) return
    chrome.tabs.create({ url: 'https://app.mailfalcon.app/dashboard' })
    chrome.notifications.clear(notifId)
  })

  void start()
})
