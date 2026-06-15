import * as InboxSDK from '@inboxsdk/core'
import { listTemplates, type Template } from '../api'
import { config } from '../config'
import type {
  ComposeEvent,
  GmailAdapter,
  ProgrammaticCompose,
  RecipientHandle,
  ReplyCandidate,
} from './adapter'
import { presetToEpoch } from '../scheduled'

interface SdkRecipient {
  emailAddress?: string
  name?: string
}

function toHandles(raw: unknown[]): RecipientHandle[] {
  const out: RecipientHandle[] = []
  for (const r of raw) {
    const obj = r as SdkRecipient
    if (typeof obj.emailAddress !== 'string' || obj.emailAddress.length === 0) continue
    out.push({
      address: obj.emailAddress,
      ...(obj.name && obj.name.length > 0 ? { name: obj.name } : {}),
    })
  }
  return out
}

interface ComposeView {
  on: (event: string, cb: (e: unknown) => Promise<void> | void) => void
  addStatusBar?: (opts?: { height?: number; orderHint?: number }) => {
    el: HTMLElement
    destroy: () => void
  } | null
  getHTMLContent?: () => string
  setBodyHTML?: (html: string) => void
  setSubject?: (s: string) => void
  insertHTMLIntoBodyAtCursor?: (html: string) => void
  getToRecipients?: () => unknown[]
  getCcRecipients?: () => unknown[]
  getBccRecipients?: () => unknown[]
  setToRecipients?: (addrs: string[]) => void
  setCcRecipients?: (addrs: string[]) => void
  setBccRecipients?: (addrs: string[]) => void
  getSubject?: () => string
  getThreadID?: () => string | null
  getThreadIDAsync?: () => Promise<string | null>
  send?: (opts?: { sendAndArchive?: boolean }) => void
  close?: () => void
}

interface SentEventPayload {
  messageID?: string
  threadID?: string
}

function buildStatusBarHtml(): string {
  // Four controls. Wrap onto a second row when the compose is narrow
  // instead of horizontal-scrolling — scrolling can leave the leftmost
  // control hidden when the bar re-renders after a width change.
  return `
    <div style="display:flex;align-items:center;gap:12px;width:100%;flex-wrap:wrap;row-gap:4px;">
      <label class="mf-priv-wrap" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;flex-shrink:0;" title="Tracking is on by default. Check this to skip the pixel and link rewrite for this email only.">
        <input type="checkbox" class="mf-priv" style="margin:0;">
        <span>Privacy</span>
      </label>
      <label class="mf-tpl-wrap" style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;min-width:0;" title="Insert one of your saved templates.">
        <span>Template:</span>
        <select class="mf-tpl" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:1px 4px;max-width:140px;">
          <option value="">— pick one —</option>
        </select>
      </label>
      <label class="mf-rem-wrap" style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;" title="If no one opens within this window, MailFalcon will email you a reminder.">
        <span>Remind:</span>
        <select class="mf-rem" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:1px 4px;">
          <option value="">never</option>
          <option value="1">1d</option>
          <option value="3">3d</option>
          <option value="7">7d</option>
        </select>
      </label>
      <label class="mf-sch-wrap" style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;" title="Schedule the send for later. The browser must be running at the scheduled time.">
        <span>Send:</span>
        <select class="mf-sch" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:1px 4px;">
          <option value="now">now</option>
          <option value="in-1h">1h</option>
          <option value="in-3h">3h</option>
          <option value="tomorrow-9am">9am tmr</option>
        </select>
      </label>
    </div>
  `
}

async function populateTemplateSelect(
  select: HTMLSelectElement,
): Promise<Template[]> {
  let list: Template[] = []
  try {
    list = await listTemplates()
  } catch {
    return []
  }
  if (list.length === 0) {
    select.innerHTML = '<option value="">no templates — make some at app.mailfalcon.app/templates</option>'
    select.disabled = true
    return []
  }
  select.innerHTML = '<option value="">— pick one —</option>'
  for (const t of list) {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = t.name
    select.appendChild(opt)
  }
  return list
}

const reentered = new WeakSet<object>()

interface MessageView {
  getMessageID?: () => string
  getMessageIDAsync?: () => Promise<string>
  getSender?: () => { emailAddress?: string } | null
  getBodyElement?: () => HTMLElement | null
}

interface ThreadView {
  // Both deprecated in newer InboxSDK; we use Async at call sites.
  getThreadID?: () => string | null
  getThreadIDAsync?: () => Promise<string | null>
  on: (event: string, cb: (e: unknown) => void) => void
}

export class InboxSdkGmailAdapter implements GmailAdapter {
  private sdk: unknown = null
  private presendingHandlers: Array<(event: ComposeEvent) => Promise<void> | void> = []
  private incomingMessageHandlers: Array<(candidate: ReplyCandidate) => void> = []

  async load(): Promise<void> {
    const load = (InboxSDK as unknown as {
      load: (v: number, id: string, opts?: unknown) => Promise<unknown>
    }).load
    this.sdk = await load(2, config.inboxSdkAppId, {
      suppressAddonTitle: 'mailfalcon',
    })

    const sdk = this.sdk as {
      Compose: {
        registerComposeViewHandler: (cb: (view: unknown) => void) => void
      }
      Conversations?: {
        registerThreadViewHandler: (cb: (view: ThreadView) => void) => void
        registerMessageViewHandler?: (cb: (view: MessageView) => void) => void
      }
    }

    this.attachReplyDetection(sdk.Conversations)

    sdk.Compose.registerComposeViewHandler((rawView) => {
      const view = rawView as ComposeView

      let privacyMode = false
      let remindAfterDays: number | null = null
      let scheduledAt: number | null = null
      let consumedWithoutSend = false
      let templates: Template[] = []
      // Pre-fetch the threadID once (replaces deprecated sync getThreadID).
      let cachedThreadId: string | null = null
      void (async () => {
        try {
          if (view.getThreadIDAsync) {
            cachedThreadId = await view.getThreadIDAsync()
          } else if (view.getThreadID) {
            cachedThreadId = view.getThreadID()
          }
        } catch {
          cachedThreadId = null
        }
      })()

      try {
        // Height accommodates up to 2 wrapped rows (28px × 2 + 4px gap).
        const bar = view.addStatusBar?.({ height: 60, orderHint: 0 })
        if (bar?.el) {
          bar.el.style.cssText =
            'background:#f5f7fa;border-top:1px solid #e3e9f2;display:flex;align-items:center;padding:6px 12px;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;box-sizing:border-box;'
          bar.el.innerHTML = buildStatusBarHtml()

          const privCb = bar.el.querySelector('.mf-priv') as HTMLInputElement | null
          privCb?.addEventListener('change', () => {
            privacyMode = !!privCb.checked
          })

          const tplSelect = bar.el.querySelector('.mf-tpl') as HTMLSelectElement | null
          if (tplSelect) {
            void populateTemplateSelect(tplSelect).then((list) => {
              templates = list
            })
            tplSelect.addEventListener('change', () => {
              const t = templates.find((x) => x.id === tplSelect.value)
              if (!t) return
              if (t.subject && (!view.getSubject?.() || view.getSubject?.().length === 0)) {
                view.setSubject?.(t.subject)
              }
              const cursorInsert = view.insertHTMLIntoBodyAtCursor
              if (cursorInsert) {
                cursorInsert.call(view, t.bodyHtml)
              } else {
                const existing = view.getHTMLContent?.() ?? ''
                view.setBodyHTML?.(existing + t.bodyHtml)
              }
              tplSelect.value = ''
            })
          }

          const remSelect = bar.el.querySelector('.mf-rem') as HTMLSelectElement | null
          remSelect?.addEventListener('change', () => {
            const v = Number.parseInt(remSelect.value, 10)
            remindAfterDays = Number.isFinite(v) && v > 0 ? v : null
          })

          const schSelect = bar.el.querySelector('.mf-sch') as HTMLSelectElement | null
          schSelect?.addEventListener('change', () => {
            const v = schSelect.value
            if (v === 'now' || !v) {
              scheduledAt = null
              return
            }
            if (
              v === 'in-1h' ||
              v === 'in-3h' ||
              v === 'tomorrow-9am'
            ) {
              scheduledAt = presetToEpoch(v)
            }
          })
        }
      } catch (err) {
        console.warn('[mailfalcon] could not attach status bar:', err)
      }

      view.on('presending', async (rawEvent) => {
        if (reentered.has(view)) return

        const sdkEvent = rawEvent as { cancel: () => void }
        sdkEvent.cancel()

        const sentCallbacks: Array<
          (info: { messageId: string; threadId: string }) => void
        > = []

        // Register the sent listener once per compose; it fires after
        // Gmail confirms the actual send (which is after our reentered
        // dispatch).
        view.on('sent', (raw) => {
          const payload = raw as SentEventPayload
          if (!payload.messageID || !payload.threadID) return
          for (const cb of sentCallbacks) {
            try {
              cb({ messageId: payload.messageID, threadId: payload.threadID })
            } catch {
              /* ignore */
            }
          }
        })

        const wrapper: ComposeEvent = {
          getHtmlBody: () => view.getHTMLContent?.() ?? '',
          setHtmlBody: (html) => {
            view.setBodyHTML?.(html)
          },
          getRecipientCount: () => {
            const to = view.getToRecipients?.() ?? []
            const cc = view.getCcRecipients?.() ?? []
            const bcc = view.getBccRecipients?.() ?? []
            return to.length + cc.length + bcc.length
          },
          getRecipients: () => {
            const to = view.getToRecipients?.() ?? []
            const cc = view.getCcRecipients?.() ?? []
            const bcc = view.getBccRecipients?.() ?? []
            return [...toHandles(to), ...toHandles(cc), ...toHandles(bcc)]
          },
          getSubject: () => view.getSubject?.() ?? '',
          isPrivacyMode: () => privacyMode,
          // Privacy mode disables the reminder — no events = no way to
          // know whether to fire it.
          getRemindAfterDays: () => (privacyMode ? null : remindAfterDays),
          getThreadId: () => (privacyMode ? null : cachedThreadId),
          onSent: (cb) => {
            if (!privacyMode) sentCallbacks.push(cb)
          },
          getScheduledAt: () => scheduledAt,
          close: () => {
            consumedWithoutSend = true
            view.close?.()
          },
          cancel: () => sdkEvent.cancel(),
        }

        try {
          for (const handler of this.presendingHandlers) {
            await handler(wrapper)
          }
        } catch (err) {
          console.warn('[mailfalcon] presending handler threw:', err)
        }

        reentered.add(view)
        if (consumedWithoutSend) return
        try {
          view.send?.()
        } catch (err) {
          console.error('[mailfalcon] programmatic send failed:', err)
        }
      })
    })
  }

  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void {
    this.presendingHandlers.push(handler)
  }

  onIncomingMessage(handler: (candidate: ReplyCandidate) => void): void {
    this.incomingMessageHandlers.push(handler)
  }

  async fireProgrammaticSend(spec: ProgrammaticCompose): Promise<void> {
    const sdk = this.sdk as {
      Compose?: {
        openNewComposeView?: () => Promise<ComposeView>
      }
    }
    if (!sdk.Compose?.openNewComposeView) {
      throw new Error('InboxSDK Compose.openNewComposeView unavailable')
    }
    const view = await sdk.Compose.openNewComposeView()
    if (spec.to.length > 0) view.setToRecipients?.(spec.to)
    if (spec.cc.length > 0) view.setCcRecipients?.(spec.cc)
    if (spec.bcc.length > 0) view.setBccRecipients?.(spec.bcc)
    if (spec.subject.length > 0) view.setSubject?.(spec.subject)
    view.setBodyHTML?.(spec.bodyHtml)
    // Brief delay so InboxSDK finishes wiring fields before send fires —
    // otherwise some recipient setters race.
    await new Promise((r) => setTimeout(r, 250))
    view.send?.()
  }

  private attachReplyDetection(
    conversations: {
      registerThreadViewHandler: (cb: (view: ThreadView) => void) => void
    } | undefined,
  ): void {
    if (!conversations?.registerThreadViewHandler) return
    // Already-seen message IDs within this tab session — InboxSDK's
    // messageAdded can re-fire when the thread view re-renders. Dedup
    // here so we don't spam /v1/replies.
    const seen = new Set<string>()

    conversations.registerThreadViewHandler((threadView) => {
      // Kick off the async fetch once per thread view. getThreadID()
      // (sync) is deprecated, getThreadIDAsync() is the supported call.
      // We hold the promise in a closure so the messageAdded handler
      // awaits it (resolving instantly after the first round-trip).
      const threadIdPromise: Promise<string | null> = (async () => {
        if (threadView.getThreadIDAsync) {
          try {
            return await threadView.getThreadIDAsync()
          } catch {
            return null
          }
        }
        return threadView.getThreadID?.() ?? null
      })()

      threadView.on('messageAdded', (raw) => {
        const view = (raw as { messageView?: MessageView }).messageView
        if (!view) return

        void (async () => {
          const threadId = await threadIdPromise
          if (!threadId) return

          const messageId = view.getMessageIDAsync
            ? await view.getMessageIDAsync().catch(() => null)
            : view.getMessageID?.()
          if (!messageId || seen.has(messageId)) return
          seen.add(messageId)

          const sender = view.getSender?.() ?? null
          const senderAddress = sender?.emailAddress ?? null
          const bodyText = (view.getBodyElement?.()?.textContent ?? '').slice(
            0,
            400,
          )

          for (const handler of this.incomingMessageHandlers) {
            try {
              handler({
                threadId,
                gmailMessageId: messageId,
                senderAddress,
                bodyPreview: bodyText,
              })
            } catch {
              /* ignore */
            }
          }
        })()
      })
    })
  }
}
