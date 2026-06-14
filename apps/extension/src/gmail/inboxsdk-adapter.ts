import * as InboxSDK from '@inboxsdk/core'
import type { ComposeEvent, GmailAdapter } from './adapter'

// TODO: register a real APP_ID at inboxsdk.com before Chrome Web Store submission.
const DEV_APP_ID = 'sdk_mailfalcon_dev_local'

type AnySdk = unknown

export class InboxSdkGmailAdapter implements GmailAdapter {
  private sdk: AnySdk = null
  private presendingHandlers: Array<(event: ComposeEvent) => Promise<void> | void> = []

  async load(): Promise<void> {
    const load = (InboxSDK as unknown as { load: (v: number, id: string, opts?: unknown) => Promise<unknown> }).load
    this.sdk = await load(2, DEV_APP_ID, { suppressAddonTitle: 'mailfalcon' })

    const sdk = this.sdk as {
      Compose: {
        registerComposeViewHandler: (cb: (view: unknown) => void) => void
      }
    }

    sdk.Compose.registerComposeViewHandler((rawView) => {
      const view = rawView as {
        on: (event: string, cb: (e: unknown) => Promise<void> | void) => void
        getHTMLContent?: () => string
        setBodyHTML?: (html: string) => void
        getToRecipients?: () => unknown[]
        getCcRecipients?: () => unknown[]
        getBccRecipients?: () => unknown[]
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
