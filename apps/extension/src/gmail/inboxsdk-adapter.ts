import * as InboxSDK from '@inboxsdk/core'
import { listTemplates, type Template } from '../api'
import { config } from '../config'
import type { ComposeEvent, GmailAdapter, RecipientHandle } from './adapter'

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
  getSubject?: () => string
  getThreadID?: () => string | null
  send?: (opts?: { sendAndArchive?: boolean }) => void
}

interface SentEventPayload {
  messageID?: string
  threadID?: string
}

function buildStatusBarHtml(): string {
  return `
    <div style="display:flex;align-items:center;gap:14px;width:100%;">
      <label class="mf-priv-wrap" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" title="Tracking is on by default. Check this to skip the pixel and link rewrite for this email only.">
        <input type="checkbox" class="mf-priv" style="margin:0;">
        <span>Privacy mode</span>
      </label>
      <span style="opacity:0.4;">·</span>
      <label class="mf-tpl-wrap" style="display:inline-flex;align-items:center;gap:6px;" title="Insert one of your saved templates.">
        <span>Template:</span>
        <select class="mf-tpl" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:1px 4px;">
          <option value="">— pick one —</option>
        </select>
      </label>
      <span style="opacity:0.4;">·</span>
      <label class="mf-rem-wrap" style="display:inline-flex;align-items:center;gap:6px;" title="If no one opens within this window, MailFalcon will email you a reminder.">
        <span>Remind in:</span>
        <select class="mf-rem" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:1px 4px;">
          <option value="">no reminder</option>
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
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

export class InboxSdkGmailAdapter implements GmailAdapter {
  private sdk: unknown = null
  private presendingHandlers: Array<(event: ComposeEvent) => Promise<void> | void> = []

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
    }

    sdk.Compose.registerComposeViewHandler((rawView) => {
      const view = rawView as ComposeView

      let privacyMode = false
      let remindAfterDays: number | null = null
      let templates: Template[] = []

      try {
        const bar = view.addStatusBar?.({ height: 28, orderHint: 0 })
        if (bar?.el) {
          bar.el.style.cssText =
            'background:#f5f7fa;border-top:1px solid #e3e9f2;display:flex;align-items:center;padding:0 12px;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;'
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
          getThreadId: () =>
            privacyMode ? null : view.getThreadID?.() ?? null,
          onSent: (cb) => {
            if (!privacyMode) sentCallbacks.push(cb)
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
}
