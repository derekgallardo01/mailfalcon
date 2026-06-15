import {
  isTrackedThread,
  mintEmail,
  patchEmailIds,
  rememberTrackedThread,
  reportReply,
} from '../src/api'
import { getSession } from '../src/auth-store'
import { config } from '../src/config'
import { InboxSdkGmailAdapter } from '../src/gmail/inboxsdk-adapter'
import { prepareTrackedBody } from '../src/inject'

const AUTOREPLY_RE = /^\s*(auto[ -]?reply|out of office|away|on vacation|vacation responder)/i

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

    // Inbound message → "reply" event if it's on a thread we tracked.
    // Skip our own sends + auto-replies. Server dedupes via the
    // messageId KV nonce so we can be loose here.
    adapter.onIncomingMessage(async (candidate) => {
      const session = await getSession().catch(() => null)
      if (!session) return
      if (
        candidate.senderAddress &&
        candidate.senderAddress.toLowerCase() === session.email.toLowerCase()
      ) {
        return
      }
      if (AUTOREPLY_RE.test(candidate.bodyPreview)) return
      const tracked = await isTrackedThread(candidate.threadId)
      if (!tracked) return
      try {
        await reportReply(candidate.threadId, candidate.gmailMessageId)
      } catch (err) {
        console.warn('[mailfalcon] reportReply failed:', err)
      }
    })

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
        // Patch the row so reply detection can correlate against it later
        // and add the threadId to the local "tracked threads" set so the
        // content-script listener fires for inbound messages on it.
        event.onSent(({ messageId, threadId }) => {
          void patchEmailIds(id, { messageId, threadId }).catch((err) => {
            console.warn('[mailfalcon] patch ids failed:', err)
          })
          void rememberTrackedThread(threadId)
        })
      } catch (err) {
        console.error('[mailfalcon] tracking failed, letting send proceed clean:', err)
      }
    })
  },
})
