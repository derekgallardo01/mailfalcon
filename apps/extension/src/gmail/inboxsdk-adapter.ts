import * as InboxSDK from '@inboxsdk/core'
import { config } from '../config'
import type { ComposeEvent, GmailAdapter } from './adapter'

type AnySdk = unknown

// Compose views that have already been rewritten and re-dispatched. We
// must not re-intercept their second presending or we'd loop forever.
const reentered = new WeakSet<object>()

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
        getSubject?: () => string
        send?: (opts?: { sendAndArchive?: boolean }) => void
      }

      let privacyMode = false

      try {
        const bar = view.addStatusBar?.({ height: 28, orderHint: 0 })
        if (bar?.el) {
          bar.el.style.cssText =
            'background:#f5f7fa;border-top:1px solid #e3e9f2;display:flex;align-items:center;padding:0 12px;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;'
          bar.el.innerHTML = `
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" title="Tracking is on by default. Check this to skip the pixel and link rewrite for this email only. The send goes through Gmail untouched.">
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
        // Second time around — we already rewrote and re-sent. Let it
        // through.
        if (reentered.has(view)) {
          return
        }

        const sdkEvent = rawEvent as { cancel: () => void }

        // First time: cancel synchronously so Gmail doesn't ship the
        // original body while we await the mint. InboxSDK's event
        // emitter doesn't await our async handler, so we'd otherwise
        // race.
        sdkEvent.cancel()

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
          getSubject: () => view.getSubject?.() ?? '',
          isPrivacyMode: () => privacyMode,
          cancel: () => sdkEvent.cancel(),
        }

        try {
          for (const handler of this.presendingHandlers) {
            await handler(wrapper)
          }
        } catch (err) {
          console.warn('[mailfalcon] presending handler threw:', err)
        }

        // Re-fire send. The second presending pass falls through the
        // `reentered.has(view)` guard above.
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
