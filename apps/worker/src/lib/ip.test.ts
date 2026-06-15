import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { getClientIp } from './ip'

function makeCtx(headers: Record<string, string>): Context {
  return {
    req: {
      header: (name: string): string | undefined => headers[name],
    },
  } as unknown as Context
}

describe('getClientIp', () => {
  it('returns the CF-Connecting-IP header when present', () => {
    expect(getClientIp(makeCtx({ 'CF-Connecting-IP': '1.2.3.4' }))).toBe(
      '1.2.3.4',
    )
  })

  it('returns "unknown" when the header is absent', () => {
    expect(getClientIp(makeCtx({}))).toBe('unknown')
  })

  it('ignores X-Forwarded-For (untrusted)', () => {
    expect(getClientIp(makeCtx({ 'X-Forwarded-For': '9.9.9.9' }))).toBe(
      'unknown',
    )
  })
})
