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
import { schedule as scheduleSend, type ScheduledSend } from '../src/scheduled'

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

    // Listen for the SW dispatching a scheduled-send to this tab. We
     // open a new compose, set the fields, and let the normal presend
     // pipeline track + send.
     chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
       if (!msg || typeof msg !== 'object' || msg.type !== 'fire-scheduled-send') {
         return false
       }
       const record = msg.record as ScheduledSend
       void (async () => {
         try {
           await adapter.fireProgrammaticSend({
             to: record.to,
             cc: record.cc,
             bcc: record.bcc,
             subject: record.subject,
             bodyHtml: record.bodyHtml,
           })
           sendResponse({ ok: true })
         } catch (err) {
           console.error('[mailfalcon] programmatic dispatch failed:', err)
           sendResponse({ ok: false, error: String(err) })
         }
       })()
       return true
     })

    adapter.onPresending(async (event) => {
      // If the user picked a future send time, queue the compose and
      // close. We DO NOT mint a tracking row here — the row is minted
      // when the alarm fires and we re-open the compose.
      const scheduledAt = event.getScheduledAt()
      if (scheduledAt && scheduledAt > Date.now() + 30_000) {
        try {
          const recipients = event.getRecipients()
          await scheduleSend({
            scheduledAt,
            to: recipients.map((r) => r.address),
            cc: [],
            bcc: [],
            subject: event.getSubject(),
            bodyHtml: event.getHtmlBody(),
          })
          event.close()
          console.log('[mailfalcon] scheduled send queued', { scheduledAt })
        } catch (err) {
          console.error('[mailfalcon] schedule failed:', err)
        }
        return
      }

      if (event.isPrivacyMode()) {
        console.log('[mailfalcon] privacy mode: send going out untracked')
        return
      }

      const recipientCount = event.getRecipientCount()
      const recipients = event.getRecipients()
      const originalHtml = event.getHtmlBody()
      const subjectStr = event.getSubject()
      const subject = subjectStr.trim() || undefined
      const remindAfterDays = event.getRemindAfterDays() ?? undefined
      const presendThreadId = event.getThreadId() ?? undefined
      const mailMerge = event.isMailMerge() && recipientCount > 1

      try {
        const result = await prepareTrackedBody({
          html: originalHtml,
          recipientCount,
          recipients,
          subject,
          ...(remindAfterDays !== undefined ? { remindAfterDays } : {}),
          ...(presendThreadId ? { threadId: presendThreadId } : {}),
          mailMerge,
          trackerHost: config.trackerHost,
          mint: mintEmail,
        })

        if (result.mode === 'merge') {
          // Cancel the original and dispatch one tracked send per
          // recipient with that recipient's tracking pre-baked into
          // their body variant.
          event.close()
          console.log('[mailfalcon] mail-merge dispatch', {
            id: result.id,
            variants: result.variants.length,
            linkCount: result.linkCount,
          })
          for (const variant of result.variants) {
            try {
              await adapter.dispatchPrebakedSend({
                to: [variant.recipient.address],
                cc: [],
                bcc: [],
                subject: subjectStr,
                bodyHtml: variant.html,
              })
            } catch (err) {
              console.error(
                '[mailfalcon] mail-merge variant send failed:',
                variant.recipient.address,
                err,
              )
            }
          }
          // Reply detection works off threadId — for mail-merge we get
          // N different threads, so we don't backfill or remember any
          // particular one. Reply attribution for merged sends is a
          // v2 polish item.
          return
        }

        event.setHtmlBody(result.html)
        console.log('[mailfalcon] tracked send', {
          id: result.id,
          recipientCount,
          pixelCount: result.pixelCount,
          linkCount: result.linkCount,
          remindAfterDays,
          threadId: presendThreadId,
          links: result.originalLinks,
        })

        // Gmail mints the real threadID + messageID on send confirmation.
        // Patch the row so reply detection can correlate against it later
        // and add the threadId to the local "tracked threads" set so the
        // content-script listener fires for inbound messages on it.
        event.onSent(({ messageId, threadId }) => {
          void patchEmailIds(result.id, { messageId, threadId }).catch((err) => {
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
