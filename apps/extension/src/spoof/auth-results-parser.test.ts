import { describe, expect, it } from 'vitest'
import { parseAuthResults } from './auth-results-parser'

describe('parseAuthResults', () => {
  it('returns null for empty input', () => {
    expect(parseAuthResults('')).toBeNull()
    expect(parseAuthResults('   ')).toBeNull()
  })

  it('returns null when authority is not mx.google.com', () => {
    expect(
      parseAuthResults(
        'spf.mail.example.com; spf=pass smtp.mailfrom=alice@example.com',
      ),
    ).toBeNull()
    expect(
      parseAuthResults(
        'mx.outlook.com; dkim=pass header.i=@example.com; spf=pass',
      ),
    ).toBeNull()
  })

  it('parses a clean Stripe-style header', () => {
    const r = parseAuthResults(
      'mx.google.com; dkim=pass header.i=@stripe.com header.s=google; spf=pass (google.com: domain of foo@stripe.com) smtp.mailfrom=foo@stripe.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=stripe.com',
    )
    expect(r).not.toBeNull()
    expect(r?.authority).toBe('mx.google.com')
    expect(r?.spf).toBe('pass')
    expect(r?.dkim).toBe('pass')
    expect(r?.dmarc).toBe('pass')
    expect(r?.headerFrom).toBe('stripe.com')
    expect(r?.dkimDomain).toBe('stripe.com')
  })

  it('captures a fail verdict', () => {
    const r = parseAuthResults(
      'mx.google.com; dkim=fail header.i=@spoofed.tld; spf=fail smtp.mailfrom=x@spoofed.tld; dmarc=fail header.from=spoofed.tld',
    )
    expect(r?.dkim).toBe('fail')
    expect(r?.spf).toBe('fail')
    expect(r?.dmarc).toBe('fail')
  })

  it('returns null verdict for missing methods', () => {
    const r = parseAuthResults(
      'mx.google.com; spf=pass smtp.mailfrom=alice@example.com',
    )
    expect(r?.spf).toBe('pass')
    expect(r?.dkim).toBeNull()
    expect(r?.dmarc).toBeNull()
  })

  it('handles softfail / neutral / none / temperror / permerror', () => {
    const r = parseAuthResults(
      'mx.google.com; spf=softfail; dkim=none; dmarc=temperror',
    )
    expect(r?.spf).toBe('softfail')
    expect(r?.dkim).toBe('none')
    expect(r?.dmarc).toBe('temperror')
  })

  it('tolerates extra whitespace and newlines', () => {
    const r = parseAuthResults(`
      mx.google.com;
        dkim=pass header.i=@stripe.com;
        spf=pass;
        dmarc=pass header.from=stripe.com
    `)
    expect(r?.dkim).toBe('pass')
    expect(r?.spf).toBe('pass')
  })

  it('handles method/version tokens like dkim/1=pass', () => {
    const r = parseAuthResults(
      'mx.google.com; dkim/1=pass header.i=@stripe.com; spf=pass',
    )
    expect(r?.dkim).toBe('pass')
  })

  it('ignores unrecognized verdict tokens', () => {
    const r = parseAuthResults('mx.google.com; dkim=mystery; spf=pass')
    expect(r?.dkim).toBeNull()
    expect(r?.spf).toBe('pass')
  })

  it('lowercases authority + headerFrom + dkimDomain', () => {
    const r = parseAuthResults(
      'MX.GOOGLE.COM; dkim=pass header.i=@STRIPE.COM; dmarc=pass header.from=STRIPE.COM',
    )
    expect(r?.authority).toBe('mx.google.com')
    expect(r?.headerFrom).toBe('stripe.com')
    expect(r?.dkimDomain).toBe('stripe.com')
  })

  it('returns null if no semicolon (malformed)', () => {
    expect(parseAuthResults('mx.google.com')).toBeNull()
  })
})
