import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { googleTokens, trackedEmails, events, sequenceEnrollments } from '@mailfalcon/db/schema'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'
import { getGoogleAccessToken } from '../lib/google-tokens'
import { createLogger } from '../lib/logger'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  TOKEN_ENC_KEY?: string
}

export const gmailWebhookRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

const pubsubSchema = z.object({
  message: z.object({
    data: z.string(),
  }),
})

gmailWebhookRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = pubsubSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ ok: true }) // Acknowledge to Pub/Sub to avoid retries
  }

  let decodedStr = ''
  try {
    // Handle both standard base64 and URL-safe base64
    const base64Standard = parsed.data.message.data.replace(/-/g, '+').replace(/_/g, '/')
    decodedStr = Buffer.from(base64Standard, 'base64').toString('utf8')
  } catch {
    return c.json({ ok: true })
  }

  let payload: { emailAddress?: string; historyId?: number }
  try {
    payload = JSON.parse(decodedStr)
  } catch {
    return c.json({ ok: true })
  }

  if (!payload.emailAddress) {
    return c.json({ ok: true })
  }

  const db = getDb(c.env.DB)
  const token = await db
    .select({ userId: googleTokens.userId })
    .from(googleTokens)
    .where(eq(googleTokens.googleEmail, payload.emailAddress))
    .get()

  if (!token) {
    return c.json({ ok: true })
  }

  try {
    const t = await getGoogleAccessToken(db, c.env, token.userId)
    
    // Fetch recent messages
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
      {
        headers: { Authorization: `Bearer ${t.accessToken}` }
      }
    )
    
    if (!res.ok) {
      return c.json({ ok: true })
    }
    
    const data = (await res.json()) as { messages?: { id: string; threadId: string }[] }
    if (!data.messages) return c.json({ ok: true })
    
    const threadIds = data.messages.map(m => m.threadId)
    if (threadIds.length === 0) return c.json({ ok: true })

    // Find tracked emails that match these threads
    const matchedEmails = await db
      .select({
        id: trackedEmails.id,
        threadId: trackedEmails.threadId,
        messageId: trackedEmails.messageId,
      })
      .from(trackedEmails)
      .where(and(
        eq(trackedEmails.userId, token.userId),
        inArray(trackedEmails.threadId, threadIds)
      ))
      .all()
      
    const emailByThreadId = new Map(matchedEmails.map(e => [e.threadId, e]))

    for (const msg of data.messages) {
      const email = emailByThreadId.get(msg.threadId)
      if (email && email.messageId !== msg.id) {
        // Verify this message is an INCOMING message (not sent by the user)
        const msgDetailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msg.id)}?format=minimal`,
          { headers: { Authorization: `Bearer ${t.accessToken}` } }
        )
        if (!msgDetailRes.ok) continue
        const msgDetail = (await msgDetailRes.json()) as { labelIds?: string[] }
        
        // If it has 'SENT' label, it is a message sent by the user, not a prospect reply
        if (msgDetail.labelIds?.includes('SENT')) {
          continue
        }

        // It's a genuine inbound reply!
        // Record the event if not already recorded
        const existingEvent = await db
          .select()
          .from(events)
          .where(and(
            eq(events.emailId, email.id),
            eq(events.type, 'reply')
          ))
          .get()
          
        if (!existingEvent) {
          await db.insert(events).values({
            emailId: email.id,
            type: 'reply',
            ts: Date.now(),
            uaClass: 'unknown',
          })
          
          // Cancel active sequence enrollments
          await db
            .update(sequenceEnrollments)
            .set({ status: 'cancelled_replied' })
            .where(and(
              eq(sequenceEnrollments.initialEmailId, email.id),
              eq(sequenceEnrollments.status, 'active')
            ))
        }
      }
    }
  } catch (err) {
    createLogger({ env: c.env }).warn('gmail_webhook_processing_failed', {
      userId: token.userId,
    })
  }

  return c.json({ ok: true })
})
