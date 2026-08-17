import { Hono } from 'hono'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  sequenceEnrollments,
  sequences,
  sequenceSteps,
  users,
} from '@mailfalcon/db/schema'
import { getDb } from '../lib/db'
import { type Variables } from '../lib/auth-middleware'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const sequencesRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

const createSequenceSchema = z.object({
  name: z.string().min(1).max(100),
  workspaceId: z.string().optional(),
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().min(1),
        delayDays: z.number().int().min(1).max(90),
        condition: z.enum(['no_reply', 'no_open', 'always']).default('no_reply'),
        templateId: z.string().optional(),
        subject: z.string().min(1).max(500),
        bodyHtml: z.string().min(1),
      }),
    )
    .min(1),
})

const enrollContactSchema = z.object({
  recipientEmail: z.string().email(),
  initialEmailId: z.string().optional(),
  delayDays: z.number().int().min(1).optional(),
})

// List sequences for current user / workspace
sequencesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  const rows = await db
    .select()
    .from(sequences)
    .where(eq(sequences.userId, userId))
    .all()

  const result = await Promise.all(
    rows.map(async (seq) => {
      const steps = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, seq.id))
        .orderBy(sequenceSteps.stepNumber)
        .all()

      const enrollmentsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, seq.id),
            eq(sequenceEnrollments.status, 'active'),
          ),
        )
        .get()

      return {
        ...seq,
        steps,
        activeEnrollments: enrollmentsCount?.count ?? 0,
      }
    }),
  )

  return c.json({ sequences: result })
})

// Create sequence
sequencesRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const parsed = createSequenceSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.issues }, 400)
  }

  const db = getDb(c.env.DB)
  const seqId = `seq_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  await db.insert(sequences).values({
    id: seqId,
    userId,
    workspaceId: parsed.data.workspaceId ?? null,
    name: parsed.data.name,
    status: 'active',
    createdAt: Date.now(),
  })

  for (const step of parsed.data.steps) {
    const stepId = `stp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    await db.insert(sequenceSteps).values({
      id: stepId,
      sequenceId: seqId,
      stepNumber: step.stepNumber,
      delayDays: step.delayDays,
      condition: step.condition,
      templateId: step.templateId ?? null,
      subject: step.subject,
      bodyHtml: step.bodyHtml,
    })
  }

  return c.json({ ok: true, id: seqId }, 201)
})

// Enroll contact in sequence
sequencesRouter.post('/:id/enroll', async (c) => {
  const userId = c.get('userId')
  const seqId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const parsed = enrollContactSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.issues }, 400)
  }

  const db = getDb(c.env.DB)
  const seq = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, seqId), eq(sequences.userId, userId)))
    .get()
  if (!seq) return c.json({ error: 'sequence_not_found' }, 404)

  const firstStep = await db
    .select()
    .from(sequenceSteps)
    .where(
      and(
        eq(sequenceSteps.sequenceId, seqId),
        eq(sequenceSteps.stepNumber, 1),
      ),
    )
    .get()
  if (!firstStep) return c.json({ error: 'sequence_has_no_steps' }, 400)

  const delayDays = parsed.data.delayDays ?? firstStep.delayDays
  const nextStepAt = Date.now() + delayDays * 86_400_000
  const enrollId = `enr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  await db.insert(sequenceEnrollments).values({
    id: enrollId,
    sequenceId: seqId,
    userId,
    recipientEmail: parsed.data.recipientEmail.toLowerCase().trim(),
    currentStep: 1,
    status: 'active',
    lastStepAt: Date.now(),
    nextStepAt,
    initialEmailId: parsed.data.initialEmailId ?? null,
  })

  return c.json({ ok: true, enrollmentId: enrollId }, 201)
})

// Delete sequence
sequencesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const seqId = c.req.param('id')
  const db = getDb(c.env.DB)

  const seq = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, seqId), eq(sequences.userId, userId)))
    .get()
  if (!seq) return c.json({ error: 'not_found' }, 404)

  await db.delete(sequences).where(eq(sequences.id, seqId))
  return c.json({ ok: true })
})
