import { mintEmail } from '../src/api'
import { config } from '../src/config'
import { InboxSdkGmailAdapter } from '../src/gmail/inboxsdk-adapter'
import { prepareTrackedBody } from '../src/inject'

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  async main() {
    console.log('[mailfalcon] gmail content script loaded')

    const adapter = new InboxSdkGmailAdapter()
    try {
      await adapter.load()
    } catch (err) {
      console.error('[mailfalcon] InboxSDK load failed:', err)
      return
    }

    adapter.onPresending(async (event) => {
      if (event.isPrivacyMode()) {
        console.log('[mailfalcon] privacy mode: send going out untracked')
        return
      }

      const recipientCount = event.getRecipientCount()
      const originalHtml = event.getHtmlBody()

      try {
        const { html, id, linkCount, originalLinks } = await prepareTrackedBody({
          html: originalHtml,
          recipientCount,
          trackerHost: config.trackerHost,
          mint: mintEmail,
        })
        event.setHtmlBody(html)
        console.log('[mailfalcon] tracked send', {
          id,
          recipientCount,
          linkCount,
          links: originalLinks,
        })
      } catch (err) {
        console.error('[mailfalcon] tracking failed, letting send proceed clean:', err)
      }
    })
  },
})
