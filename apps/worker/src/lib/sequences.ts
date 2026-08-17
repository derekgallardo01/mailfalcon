import { and, eq, lte } from 'drizzle-orm'
import {
  events,
  sequenceEnrollments,
  sequences,
  sequenceSteps,
  users,
} from '@mailfalcon/db/schema'
import type { D1Database } from '@cloudflare/workers-types'
import { sendFollowupReminder } from './mailer'

export async function evaluateSequences(
  db: any,
  env: {
    RESEND_API_KEY?: string
    ENVIRONMENT: string
    PUBLIC_WEB_URL?: string
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

    if (user?.email) {
      await sendFollowupReminder({
        to: user.email,
        subject: `Sequence Action: Follow up with ${enr.recipientEmail}`,
        emailId: enr.initialEmailId ?? '',
        sentAt: enr.lastStepAt ?? now,
        webUrl: env.PUBLIC_WEB_URL ?? 'https://mailfalcon.app',
        env,
      }).catch(() => {})
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
