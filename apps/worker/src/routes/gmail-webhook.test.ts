import { describe, expect, it } from 'vitest'
import { gmailWebhookRouter } from './gmail-webhook'

describe('gmailWebhookRouter', () => {
  it('returns ok: true on invalid or empty JSON body to acknowledge Pub/Sub', async () => {
    const res = await gmailWebhookRouter.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })

  it('handles Base64URL-encoded data payloads safely without throwing', async () => {
    // URL-safe base64 containing _ and -
    const rawPayload = JSON.stringify({ emailAddress: 'test@example.com', historyId: 12345 })
    const base64Url = Buffer.from(rawPayload)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          raw: async () => [],
          run: async () => ({ success: true }),
          first: async () => null,
        }),
        all: async () => ({ results: [] }),
        raw: async () => [],
        run: async () => ({ success: true }),
        first: async () => null,
      }),
      batch: async () => [],
    }

    const res = await gmailWebhookRouter.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            data: base64Url,
          },
        }),
      },
      {
        ENVIRONMENT: 'test',
        DB: mockDb as any,
      },
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })
})
