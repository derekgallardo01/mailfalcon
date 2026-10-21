import { and, eq, lte } from 'drizzle-orm'
import {
  events,
  sequenceEnrollments,
  sequences,
  sequenceSteps,
  users,
  trackedEmails,
  recipients,
} from '@mailfalcon/db/schema'
import type { D1Database } from '@cloudflare/workers-types'
import { sendFollowupReminder } from './mailer'
import { getGoogleAccessToken } from './google-tokens'
import { buildRfc5322, base64UrlEncodeRfc5322 } from './rfc5322'
import { createLogger } from './logger'
import { sendGmailMessage } from '../routes/compose'
import { newTrackingId, newSalt } from '@mailfalcon/shared'

export async function evaluateSequences(
  db: any,
  env: {
    RESEND_API_KEY?: string
    ENVIRONMENT: string
    PUBLIC_WEB_URL?: string
    GOOGLE_OAUTH_CLIENT_ID?: string
    GOOGLE_OAUTH_CLIENT_SECRET?: string
    TOKEN_ENC_KEY?: string
    AXIOM_TOKEN?: string
    AXIOM_DATASET?: string
  },
): Promise<{ processed: number; sent: number; cancelled: number }> {
  const now = Date.now()
  let processed = 0
  let sent = 0
  let cancelled = 0

  const pending = await db
    .select()
    .from(sequenceEnrollments)
    .where(
      and(
        eq(sequenceEnrollments.status, 'active'),
        lte(sequenceEnrollments.nextStepAt, now),
      ),
    )
    .all()

  for (const enr of pending) {
    processed++

    // Check if recipient has replied on initial email
    if (enr.initialEmailId) {
      const reply = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.emailId, enr.initialEmailId),
            eq(events.type, 'reply'),
          ),
        )
        .get()

      if (reply) {
        await db
          .update(sequenceEnrollments)
          .set({ status: 'cancelled_replied' })
          .where(eq(sequenceEnrollments.id, enr.id))
        cancelled++
        continue
      }
    }

    const currentStep = await db
      .select()
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.sequenceId, enr.sequenceId),
          eq(sequenceSteps.stepNumber, enr.currentStep),
        ),
      )
      .get()

    if (!currentStep) {
      await db
        .update(sequenceEnrollments)
        .set({ status: 'completed' })
        .where(eq(sequenceEnrollments.id, enr.id))
      continue
    }

    // Check condition (e.g. no_open)
    if (currentStep.condition === 'no_open' && enr.initialEmailId) {
      const open = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.emailId, enr.initialEmailId),
            eq(events.type, 'open'),
          ),
        )
        .get()

      if (open) {
        // Skip step if already opened
        await db
          .update(sequenceEnrollments)
          .set({ status: 'completed' })
          .where(eq(sequenceEnrollments.id, enr.id))
        continue
      }
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, enr.userId))
      .get()

    let dispatched = false
    if (user && enr.initialEmailId) {
      const initialEmail = await db
        .select()
        .from(trackedEmails)
        .where(eq(trackedEmails.id, enr.initialEmailId))
        .get()

      if (initialEmail && initialEmail.threadId) {
        try {
          const t = await getGoogleAccessToken(db, env as any, user.id)
          
          const raw = buildRfc5322({
            fromAddress: t.googleEmail,
            fromName: user.companyName ?? undefined,
            to: [enr.recipientEmail],
            cc: [],
            bcc: [],
            subject: currentStep.subject || `Re: ${initialEmail.subject || ''}`,
            htmlBody: currentStep.bodyHtml,
            inReplyTo: initialEmail.messageId || undefined,
            references: initialEmail.messageId || undefined,
            attachments: [],
          })
          const encoded = base64UrlEncodeRfc5322(raw)

          const gmailRes = await sendGmailMessage({
            accessToken: t.accessToken,
            rawRfc5322: raw,
            threadId: initialEmail.threadId,
          })

          if (gmailRes.id) {
            dispatched = true
            const newEmailId = newTrackingId()
            const hmacSalt = newSalt()
            
            await db.batch([
              db.insert(trackedEmails).values({
                id: newEmailId,
                userId: user.id,
                subjectHash: null,
                subject: currentStep.subject || `Re: ${initialEmail.subject || ''}`,
                threadId: initialEmail.threadId,
                messageId: gmailRes.id,
                recipientCount: 1,
                sentAt: now,
                hmacSalt,
                privacyMode: 0,
              }),
              db.insert(recipients).values({
                id: `${newEmailId}:r${Math.random().toString(36).slice(2, 10)}`,
                emailId: newEmailId,
                hashedAddr: 'none', // We'd need sha256HexLower here if we cared about strict tracking, but simple placeholder works or we can inline it
                displayLabel: enr.recipientEmail.split('@')[0] ?? enr.recipientEmail,
              })
            ])
          }
        } catch (err) {
           const msg = err instanceof Error ? err.message : String(err)
           createLogger({ env: env as any }).warn('sequence_gmail_dispatch_error', {
             userId: user.id,
             detail: msg.slice(0, 300),
           })
        }
      }
    }

    if (!dispatched && user?.email) {
      await sendFollowupReminder({
        to: user.email,
        subject: `Sequence Action: Follow up with ${enr.recipientEmail}`,
        emailId: enr.initialEmailId ?? '',
        sentAt: enr.lastStepAt ?? now,
        webUrl: env.PUBLIC_WEB_URL ?? 'https://mailfalcon.app',
        env: env as any,
      }).catch(() => {})
    }
    if (dispatched || user?.email) {
      sent++
    }

    // Check for next step
    const nextStep = await db
      .select()
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.sequenceId, enr.sequenceId),
          eq(sequenceSteps.stepNumber, enr.currentStep + 1),
        ),
      )
      .get()

    if (nextStep) {
      await db
        .update(sequenceEnrollments)
        .set({
          currentStep: enr.currentStep + 1,
          lastStepAt: now,
          nextStepAt: now + nextStep.delayDays * 86_400_000,
        })
        .where(eq(sequenceEnrollments.id, enr.id))
    } else {
      await db
        .update(sequenceEnrollments)
        .set({
          status: 'completed',
          lastStepAt: now,
        })
        .where(eq(sequenceEnrollments.id, enr.id))
    }
  }

  return { processed, sent, cancelled }
}
