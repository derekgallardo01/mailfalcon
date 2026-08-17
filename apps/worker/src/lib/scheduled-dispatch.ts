import { and, eq, lte } from 'drizzle-orm'
import {
  googleTokens,
  scheduledSends,
  trackedEmails,
} from '@mailfalcon/db/schema'
import { getGoogleAccessToken } from './google-tokens'
import { buildRfc5322 } from './rfc5322'
import { createLogger, errorMeta } from './logger'

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function dispatchDueScheduledSends(
  db: any,
  env: {
    DB: D1Database
    KV: KVNamespace
    ENVIRONMENT: string
    GOOGLE_OAUTH_CLIENT_ID?: string
    GOOGLE_OAUTH_CLIENT_SECRET?: string
    TOKEN_ENC_KEY?: string
    HMAC_SECRET?: string
  },
): Promise<{ dispatched: number; failed: number }> {
  const now = Date.now()
  let dispatched = 0
  let failed = 0
  const log = createLogger({ env })

  const due = await db
    .select()
    .from(scheduledSends)
    .where(
      and(
        eq(scheduledSends.status, 'queued'),
        lte(scheduledSends.scheduledAt, now),
      ),
    )
    .all()

  for (const item of due) {
    try {
      const gTok = await db
        .select()
        .from(googleTokens)
        .where(eq(googleTokens.userId, item.userId))
        .get()

      if (!gTok) {
        // No OAuth token stored; waiting for extension local alarm
        continue
      }

      const accessToken = await getGoogleAccessToken(
        db,
        env,
        item.userId,
      ).catch(() => null)

      if (!accessToken) {
        continue
      }

      const to: string[] = JSON.parse(item.toAddresses || '[]')
      const cc: string[] = JSON.parse(item.ccAddresses || '[]')
      const bcc: string[] = JSON.parse(item.bccAddresses || '[]')

      const rawRfc = buildRfc5322({
        fromAddress: gTok.googleEmail,
        to,
        cc,
        bcc,
        subject: item.subject,
        htmlBody: `<p>${item.subject}</p>`,
      })

      const sendRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: toBase64Url(rawRfc) }),
        },
      )

      if (sendRes.ok) {
        const sendJson = (await sendRes.json()) as { id?: string; threadId?: string }
        await db
          .update(scheduledSends)
          .set({
            status: 'fired',
            firedAt: Date.now(),
            updatedAt: Date.now(),
          })
          .where(eq(scheduledSends.id, item.id))
        dispatched++
        log.info('scheduled_send_cloud_dispatched', { id: item.id, messageId: sendJson.id })
      } else {
        const errText = await sendRes.text()
        log.warn('scheduled_send_cloud_failed', { id: item.id, err: errText })
      }
    } catch (err) {
      failed++
      log.error('scheduled_send_dispatch_error', { id: item.id, ...errorMeta(err) })
    }
  }

  return { dispatched, failed }
}
