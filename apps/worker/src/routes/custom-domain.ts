import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '@mailfalcon/db/schema'
import { newSalt } from '@mailfalcon/shared'
import type { Variables } from '../lib/auth-middleware'
import { getDb } from '../lib/db'

type Bindings = {
  ENVIRONMENT: string
  DB: D1Database
}

const setSchema = z.object({
  host: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'invalid hostname')
    .transform((s) => s.toLowerCase()),
})

export const customDomainRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

/** Returns the caller's current custom-domain state. */
customDomainRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      host: users.customTrackerHost,
      token: users.customTrackerToken,
      verifiedAt: users.customTrackerVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({
    host: row.host,
    token: row.token,
    verifiedAt: row.verifiedAt,
    instructions: row.host && row.token ? buildInstructions(row.host, row.token) : null,
  })
})

/** Set or change the custom-domain host. Generates a fresh token (so the
 *  user must re-verify) and clears verified_at. */
customDomainRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = setSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const token = `mf-verify-${newSalt().slice(0, 16)}`
  await db
    .update(users)
    .set({
      customTrackerHost: parsed.data.host,
      customTrackerToken: token,
      customTrackerVerifiedAt: null,
    })
    .where(eq(users.id, userId))
    .run()
  return c.json({
    host: parsed.data.host,
    token,
    verifiedAt: null,
    instructions: buildInstructions(parsed.data.host, token),
  })
})

/** Verify the user's domain by resolving the TXT record they should have
 *  added via Cloudflare DNS-over-HTTPS. If the value matches their
 *  token, set verified_at. */
customDomainRouter.post('/verify', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  const row = await db
    .select({
      host: users.customTrackerHost,
      token: users.customTrackerToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!row?.host || !row.token) {
    return c.json({ error: 'not_configured' }, 400)
  }
  const lookupName = `_mf-verify.${row.host}`
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(lookupName)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } },
    )
    if (!res.ok) {
      return c.json({ error: 'dns_lookup_failed', status: res.status }, 502)
    }
    const data = (await res.json()) as {
      Answer?: Array<{ data?: string; type?: number }>
    }
    const answers = (data.Answer ?? [])
      .filter((a) => a.type === 16)
      .map((a) => (a.data ?? '').replace(/^"|"$/g, ''))
    const matched = answers.some((a) => a === row.token)
    if (!matched) {
      return c.json({
        error: 'txt_not_found',
        expected: row.token,
        found: answers,
      }, 400)
    }
    const verifiedAt = Date.now()
    await db
      .update(users)
      .set({ customTrackerVerifiedAt: verifiedAt })
      .where(eq(users.id, userId))
      .run()
    return c.json({ ok: true, verifiedAt })
  } catch (err) {
    return c.json({ error: 'dns_lookup_error', detail: String(err) }, 502)
  }
})

/** Clear the custom domain — tracking reverts to t.mailfalcon.app. */
customDomainRouter.delete('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb(c.env.DB)
  await db
    .update(users)
    .set({
      customTrackerHost: null,
      customTrackerToken: null,
      customTrackerVerifiedAt: null,
    })
    .where(eq(users.id, userId))
    .run()
  return c.json({ ok: true })
})

function buildInstructions(host: string, token: string): {
  cname: { name: string; target: string }
  txt: { name: string; value: string }
} {
  return {
    cname: { name: host, target: 't.mailfalcon.app' },
    txt: { name: `_mf-verify.${host}`, value: token },
  }
}
