import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { events, trackedEmails } from '@mailfalcon/db/schema'
import { getDb } from '../lib/db'
import { type Variables } from '../lib/auth-middleware'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

export const analyticsRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

export interface SendTimeSlot {
  dayOfWeek: number // 0 (Sun) - 6 (Sat)
  hourOfDay: number // 0 - 23
  opens: number
  clicks: number
  totalActivity: number
  score: number // normalized 0 - 100
}

analyticsRouter.get('/send-time', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)

  // Query events on user's emails
  const userEvents = await db
    .select({
      type: events.type,
      ts: events.ts,
      timezone: events.timezone,
    })
    .from(events)
    .innerJoin(trackedEmails, eq(trackedEmails.id, events.emailId))
    .where(and(eq(trackedEmails.userId, userId), eq(events.notificationSuppressed, 0)))
    .all()

  // Initialize 7x24 grid (Sun=0 to Sat=6, Hour 0 to 23)
  const grid: Map<string, { opens: number; clicks: number }> = new Map()
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      grid.set(`${d}:${h}`, { opens: 0, clicks: 0 })
    }
  }

  let maxActivity = 1

  for (const ev of userEvents) {
    const date = new Date(ev.ts)
    const d = date.getUTCDay()
    const h = date.getUTCHours()
    const key = `${d}:${h}`
    const entry = grid.get(key)
    if (entry) {
      if (ev.type === 'open') entry.opens++
      if (ev.type === 'click') entry.clicks++
      const total = entry.opens + entry.clicks
      if (total > maxActivity) maxActivity = total
    }
  }

  const slots: SendTimeSlot[] = []
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const entry = grid.get(`${d}:${h}`) || { opens: 0, clicks: 0 }
      const total = entry.opens + entry.clicks
      const score = Math.round((total / maxActivity) * 100)
      slots.push({
        dayOfWeek: d,
        hourOfDay: h,
        opens: entry.opens,
        clicks: entry.clicks,
        totalActivity: total,
        score,
      })
    }
  }

  // Find peak slot
  let peakSlot = slots[0]!
  for (const slot of slots) {
    if (slot.totalActivity > peakSlot.totalActivity) {
      peakSlot = slot
    }
  }

  return c.json({
    slots,
    totalEventsAnalyzed: userEvents.length,
    peakRecommendation: {
      dayOfWeek: peakSlot.dayOfWeek,
      hourOfDay: peakSlot.hourOfDay,
      score: peakSlot.score,
    },
  })
})
