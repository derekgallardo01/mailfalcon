import { mintEmail, patchEmailIds } from '../src/api'
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
      const recipients = event.getRecipients()
      const originalHtml = event.getHtmlBody()
      const subject = event.getSubject().trim() || undefined
      const remindAfterDays = event.getRemindAfterDays() ?? undefined
      const presendThreadId = event.getThreadId() ?? undefined

      try {
        const { html, id, linkCount, originalLinks, pixelCount } =
          await prepareTrackedBody({
            html: originalHtml,
            recipientCount,
            recipients,
            subject,
            ...(remindAfterDays !== undefined ? { remindAfterDays } : {}),
            ...(presendThreadId ? { threadId: presendThreadId } : {}),
            trackerHost: config.trackerHost,
            mint: mintEmail,
          })
        event.setHtmlBody(html)
        console.log('[mailfalcon] tracked send', {
          id,
          recipientCount,
          pixelCount,
          linkCount,
          remindAfterDays,
          threadId: presendThreadId,
          links: originalLinks,
        })

        // Gmail mints the real threadID + messageID on send confirmation.
        // Patch the row so reply detection can correlate against it later.
        event.onSent(({ messageId, threadId }) => {
          void patchEmailIds(id, { messageId, threadId }).catch((err) => {
            console.warn('[mailfalcon] patch ids failed:', err)
          })
        })
      } catch (err) {
        console.error('[mailfalcon] tracking failed, letting send proceed clean:', err)
      }
    })
  },
})
