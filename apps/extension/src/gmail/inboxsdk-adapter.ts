import * as InboxSDK from '@inboxsdk/core'
import { config } from '../config'
import type { ComposeEvent, GmailAdapter } from './adapter'

type AnySdk = unknown

export class InboxSdkGmailAdapter implements GmailAdapter {
  private sdk: AnySdk = null
  private presendingHandlers: Array<(event: ComposeEvent) => Promise<void> | void> = []

  async load(): Promise<void> {
    const load = (InboxSDK as unknown as { load: (v: number, id: string, opts?: unknown) => Promise<unknown> }).load
    this.sdk = await load(2, config.inboxSdkAppId, { suppressAddonTitle: 'mailfalcon' })

    const sdk = this.sdk as {
      Compose: {
        registerComposeViewHandler: (cb: (view: unknown) => void) => void
      }
    }

    sdk.Compose.registerComposeViewHandler((rawView) => {
      const view = rawView as {
        on: (event: string, cb: (e: unknown) => Promise<void> | void) => void
        addStatusBar?: (opts?: { height?: number; orderHint?: number }) => {
          el: HTMLElement
          destroy: () => void
        } | null
        getHTMLContent?: () => string
        setBodyHTML?: (html: string) => void
        getToRecipients?: () => unknown[]
        getCcRecipients?: () => unknown[]
        getBccRecipients?: () => unknown[]
      }

      let privacyMode = false

      try {
        const bar = view.addStatusBar?.({ height: 28, orderHint: 0 })
        if (bar?.el) {
          bar.el.style.cssText =
            'background:#f5f7fa;border-top:1px solid #e3e9f2;display:flex;align-items:center;padding:0 12px;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;'
          bar.el.innerHTML = `
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;">
              <input type="checkbox" class="mf-priv" style="margin:0;">
              <span>Privacy mode &mdash; skip tracking for this email</span>
            </label>
          `
          const cb = bar.el.querySelector('.mf-priv') as HTMLInputElement | null
          cb?.addEventListener('change', () => {
            privacyMode = !!cb.checked
          })
        }
      } catch (err) {
        console.warn('[mailfalcon] could not attach status bar:', err)
      }

      view.on('presending', async (rawEvent) => {
        const sdkEvent = rawEvent as { cancel: () => void }

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
          isPrivacyMode: () => privacyMode,
          cancel: () => sdkEvent.cancel(),
        }

        for (const handler of this.presendingHandlers) {
          await handler(wrapper)
        }
      })
    })
  }

  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void {
    this.presendingHandlers.push(handler)
  }
}
