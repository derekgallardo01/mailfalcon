import { mintEmail } from '../src/api'
import { config } from '../src/config'
import { InboxSdkGmailAdapter } from '../src/gmail/inboxsdk-adapter'
import { injectTrackingArtifacts } from '../src/inject'

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
      const recipientCount = event.getRecipientCount()
      const originalHtml = event.getHtmlBody()
      const linkProbe = (originalHtml.match(/<a\s[^>]*href=/gi) ?? []).length

      try {
        const { id, sig } = await mintEmail({ recipientCount, linkCount: linkProbe })
        const { html, linkCount } = injectTrackingArtifacts(
          originalHtml,
          id,
          sig,
          config.trackerHost,
        )
        event.setHtmlBody(html)
        console.log('[mailfalcon] tracked send', { id, recipientCount, linkCount })
      } catch (err) {
        console.error('[mailfalcon] tracking failed, letting send proceed clean:', err)
      }
    })
  },
})
