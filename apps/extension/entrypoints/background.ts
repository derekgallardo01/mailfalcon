import { muteEmail } from '../src/api'
import { getSession } from '../src/auth-store'
import { bumpBadge, clearBadge, initBadge } from '../src/badge'
import { config } from '../src/config'
import { dropPushSubscription, ensurePushSubscription } from '../src/push-client'
import {
  alarmNameToId,
  cancel as cancelScheduled,
  get as getScheduled,
} from '../src/scheduled'
import { StreamClient, type StreamEvent } from '../src/stream-client'
import { fetchAuthResults } from '../src/spoof/gmail-api'
import {
  clearTokens as clearGoogleTokens,
  connectGoogle,
  disconnectGoogle,
  loadTokens as loadGoogleTokens,
} from '../src/spoof/google-oauth'
import { STORAGE_KEYS as SPOOF_KEYS } from '../src/spoof/oauth-config'

const NOTIF_PREFIX = 'mf-event-'
const NOTIF_ICON_PATH = 'icon/128.png'
const PUSH_FETCH_KEY = 'mf.lastPushFetchTs'

type Notif = { title: string; body: string }

const TITLE_MAX_LEN = 80

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function formatLocation(ev: StreamEvent): string {
  const parts: string[] = []
  if (ev.city) parts.push(ev.city)
  if (ev.regionCode) parts.push(ev.regionCode)
  else if (ev.country) parts.push(ev.country)
  return parts.join(', ')
}

function formatDevice(ev: StreamEvent): string {
  if (ev.deviceType === 'mobile') return 'Mobile'
  if (ev.deviceType === 'tablet') return 'Tablet'
  if (ev.deviceType === 'desktop' || ev.uaClass === 'desktop') return 'Desktop'
  return ''
}

function buildBody(ev: StreamEvent): string {
  const loc = formatLocation(ev)
  const dev = formatDevice(ev)
  if (loc && dev) return `${loc} · ${dev}`
  return loc || dev || ''
}

function notifFor(ev: StreamEvent): Notif {
  const subject = ev.subject?.trim() || '(no subject)'
  const who = ev.recipientLabel?.trim() || 'Someone'

  if (ev.type === 'reply') {
    return {
      title: truncate(`${who} replied: ${subject}`, TITLE_MAX_LEN),
      body: buildBody(ev) || 'New reply in your inbox',
    }
  }
  if (ev.type === 'click') {
    return {
      title: truncate(`${who} clicked: ${subject}`, TITLE_MAX_LEN),
      body: buildBody(ev) || 'A tracked link was clicked',
    }
  }
  // open
  return {
    title: truncate(`${who} opened: ${subject}`, TITLE_MAX_LEN),
    body: buildBody(ev) || (ev.isFirstOpen ? 'First open detected' : 'Opened again'),
  }
}

function deepLink(emailId: string): string {
  return `https://app.mailfalcon.app/dashboard/email?id=${encodeURIComponent(emailId)}`
}

export default defineBackground(() => {
  console.log('[mailfalcon] background service worker started')

  void initBadge()

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
    const notifId = `${NOTIF_PREFIX}${ev.id}`
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIF_ICON_PATH),
      title,
      message: body,
      priority: 1,
      buttons: [{ title: 'Mute this email' }],
    })
    // Remember which email this notif belongs to so the click handler
    // can deep-link to its detail page AND the button handler can mute
    // the right email.
    void chrome.storage.session
      ?.set({
        [`mf.notifLink:${notifId}`]: deepLink(ev.emailId),
        [`mf.notifEmail:${notifId}`]: ev.emailId,
      })
      .catch(() => undefined)
    void bumpBadge()
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
          data: { url: deepLink(ev.emailId) },
        })
        await bumpBadge()
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

  // Reset the activity badge when the user actually views the dashboard.
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete') {
      return
    }
    const url = changeInfo.url
    if (!url) return
    if (url.startsWith('https://app.mailfalcon.app/dashboard')) {
      void clearBadge()
    }
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
    // Spoof: connect / disconnect / status / verify message protocol.
    // The access token never leaves the SW — the content script only
    // ever sees the parsed verdict.
    if (msg.type === 'spoof-connect') {
      void connectGoogle()
        .then((tokens) =>
          sendResponse({ ok: true, email: tokens.connectedEmail }),
        )
        .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }))
      return true
    }
    if (msg.type === 'spoof-disconnect') {
      void disconnectGoogle()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: true }))
      return true
    }
    if (msg.type === 'spoof-status') {
      void (async () => {
        const tokens = await loadGoogleTokens()
        const stored = await chrome.storage.local.get(SPOOF_KEYS.enabled)
        sendResponse({
          connected: !!tokens,
          email: tokens?.connectedEmail ?? null,
          enabled: stored[SPOOF_KEYS.enabled] !== false,
        })
      })()
      return true
    }
    if (msg.type === 'spoof-set-enabled') {
      const enabled = !!(msg as { enabled?: boolean }).enabled
      void chrome.storage.local
        .set({ [SPOOF_KEYS.enabled]: enabled })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }))
      return true
    }
    if (msg.type === 'spoof-verify') {
      const messageId = (msg as { messageId?: string }).messageId
      if (!messageId) {
        sendResponse({ status: 'no-id' })
        return false
      }
      void (async () => {
        const tokens = await loadGoogleTokens()
        if (!tokens) {
          sendResponse({ status: 'not-connected' })
          return
        }
        const stored = await chrome.storage.local.get(SPOOF_KEYS.enabled)
        if (stored[SPOOF_KEYS.enabled] === false) {
          sendResponse({ status: 'disabled' })
          return
        }
        const result = await fetchAuthResults(messageId)
        if (result === undefined) {
          sendResponse({ status: 'error' })
          return
        }
        sendResponse({ status: 'ok', auth: result })
      })()
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

  // "Mute this email" button on SSE-driven notifications. Looks up the
  // emailId we stashed in session storage and PATCHes the email muted.
  chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
    if (!notifId.startsWith(NOTIF_PREFIX)) return
    if (btnIdx !== 0) return
    const key = `mf.notifEmail:${notifId}`
    try {
      const stored = await chrome.storage.session?.get(key)
      const emailId = stored?.[key]
      if (typeof emailId !== 'string') return
      await muteEmail(emailId, true)
    } catch (err) {
      console.warn('[mailfalcon] mute via notification failed:', err)
    } finally {
      chrome.notifications.clear(notifId)
    }
  })

  // Legacy chrome.notifications click handler (still fires for SSE-driven
  // notifications shown via chrome.notifications.create). Deep-link to
  // the specific email if we recorded a URL for this notif id.
  chrome.notifications.onClicked.addListener(async (notifId) => {
    if (!notifId.startsWith(NOTIF_PREFIX)) return
    const key = `mf.notifLink:${notifId}`
    let url = 'https://app.mailfalcon.app/dashboard'
    try {
      const stored = await chrome.storage.session?.get(key)
      const stashed = stored?.[key]
      if (typeof stashed === 'string') url = stashed
    } catch {
      /* fall back to dashboard root */
    }
    void chrome.storage.session?.remove(key).catch(() => undefined)
    chrome.tabs.create({ url })
    chrome.notifications.clear(notifId)
  })

  // Scheduled-send dispatch. Alarm fires; find an open Gmail tab; tell
  // its content script to fire the programmatic compose. If no Gmail
  // tab is open, snooze the alarm by 1 hour.
  chrome.alarms.onAlarm.addListener((alarm) => {
    const id = alarmNameToId(alarm.name)
    if (!id) return
    void (async () => {
      const record = await getScheduled(id)
      if (!record) return
      const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' })
      let dispatched = false
      for (const tab of tabs) {
        if (!tab.id) continue
        try {
          const res = (await chrome.tabs.sendMessage(tab.id, {
            type: 'fire-scheduled-send',
            record,
          })) as { ok?: boolean } | undefined
          if (res?.ok) {
            dispatched = true
            break
          }
        } catch {
          // Content script not ready on this tab; try the next one.
        }
      }
      if (dispatched) {
        await cancelScheduled(id)
      } else {
        console.warn(
          '[mailfalcon] scheduled send had no live Gmail tab; snoozing 1h',
          { id },
        )
        await chrome.alarms.create(alarm.name, { delayInMinutes: 60 })
      }
    })()
  })

  void start()
})
