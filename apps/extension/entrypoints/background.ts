import { getSession } from '../src/auth-store'
import { StreamClient, type StreamEvent } from '../src/stream-client'

const NOTIF_PREFIX = 'mf-event-'
const NOTIF_ICON_PATH = 'icon/128.png'

export default defineBackground(() => {
  console.log('[mailfalcon] background service worker started')

  let client: StreamClient | null = null

  async function start(): Promise<void> {
    const session = await getSession()
    if (!session) {
      stop()
      return
    }
    if (client) return
    client = new StreamClient(session.token, handleEvent)
    client.start()
  }

  function stop(): void {
    client?.stop()
    client = null
  }

  function handleEvent(ev: StreamEvent): void {
    if (client) client.noteEventTs(ev.ts)
    if (ev.uaClass === 'bot') return // skip noisy bot/proxy opens

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

  chrome.runtime.onStartup.addListener(() => {
    void start()
  })
  chrome.runtime.onInstalled.addListener(() => {
    void start()
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && typeof msg === 'object') {
      if ('type' in msg && msg.type === 'signed-in') {
        void start()
        sendResponse({ ok: true })
      } else if ('type' in msg && msg.type === 'signed-out') {
        stop()
        sendResponse({ ok: true })
      }
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
