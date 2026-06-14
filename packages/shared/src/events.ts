import { z } from 'zod'

export const eventTypeSchema = z.enum(['open', 'click'])
export type EventType = z.infer<typeof eventTypeSchema>

export const uaClassSchema = z.enum(['desktop', 'mobile', 'bot', 'unknown'])
export type UaClass = z.infer<typeof uaClassSchema>

export const tierSchema = z.enum(['free', 'pro', 'team'])
export type Tier = z.infer<typeof tierSchema>

export const trackedEmailSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subjectHash: z.string().nullable(),
  threadId: z.string().nullable(),
  messageId: z.string().nullable(),
  recipientCount: z.number().int().nonnegative(),
  sentAt: z.number().int(),
  hmacSalt: z.string(),
  privacyMode: z.boolean(),
})
export type TrackedEmail = z.infer<typeof trackedEmailSchema>

export const eventSchema = z.object({
  id: z.number().int().positive(),
  emailId: z.string(),
  recipientId: z.string().nullable(),
  type: eventTypeSchema,
  linkId: z.string().nullable(),
  ts: z.number().int().positive(),
  uaClass: uaClassSchema,
  ipPrefix: z.string().nullable(),
  country: z.string().nullable(),
  isFirstOpen: z.boolean(),
})
export type Event = z.infer<typeof eventSchema>

export const sseEventSchema = z.object({
  kind: z.literal('event'),
  data: eventSchema,
})
export type SseEvent = z.infer<typeof sseEventSchema>
