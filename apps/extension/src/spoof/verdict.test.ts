import { describe, expect, it } from 'vitest'
import type { AuthResults } from './auth-results-parser'
import { combineVerdicts, verdictFromHeuristics } from './verdict'

const baseAuth: AuthResults = {
  authority: 'mx.google.com',
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
  headerFrom: 'stripe.com',
  dkimDomain: 'stripe.com',
}

describe('verdictFromHeuristics', () => {
  it('returns none for empty signals', () => {
    expect(verdictFromHeuristics([]).level).toBe('none')
  })

  it('returns red for freemail_impersonation (highest precedence)', () => {
    const v = verdictFromHeuristics([
      { kind: 'cross_domain_reply', senderDomain: 'a.com', originalRecipientDomain: 'b.com' },
      { kind: 'display_name_mismatch', brandKeyword: 'paypal', fromDomain: 'fake.com' },
      { kind: 'freemail_impersonation', brandKeyword: 'stripe', fromDomain: 'gmail.com' },
    ])
    expect(v.level).toBe('red')
    expect(v.label).toContain('spoof')
  })

  it('returns red for display_name_mismatch when no freemail impersonation', () => {
    const v = verdictFromHeuristics([
      { kind: 'display_name_mismatch', brandKeyword: 'paypal', fromDomain: 'fake.com' },
    ])
    expect(v.level).toBe('red')
  })

  it('returns amber for cross_domain_reply only', () => {
    const v = verdictFromHeuristics([
      { kind: 'cross_domain_reply', senderDomain: 'newcorp.com', originalRecipientDomain: 'acme.com' },
    ])
    expect(v.level).toBe('amber')
  })
})

describe('combineVerdicts', () => {
  it('uses heuristic when auth results are null', () => {
    const v = combineVerdicts([], null)
    expect(v.level).toBe('none')
  })

  it('returns green when both heuristic and auth pass', () => {
    const v = combineVerdicts([], baseAuth)
    expect(v.level).toBe('green')
    expect(v.label).toContain('verified')
  })

  it('returns amber when dmarc is missing (unverified)', () => {
    const v = combineVerdicts([], { ...baseAuth, dmarc: null })
    expect(v.level).toBe('amber')
    expect(v.label).toContain('unverified')
  })

  it('returns amber when dmarc=none', () => {
    const v = combineVerdicts([], { ...baseAuth, dmarc: 'none' })
    expect(v.level).toBe('amber')
  })

  it('returns red when DKIM fails', () => {
    const v = combineVerdicts([], { ...baseAuth, dkim: 'fail' })
    expect(v.level).toBe('red')
    expect(v.label.toLowerCase()).toContain('dkim')
  })

  it('returns red when DMARC fails', () => {
    const v = combineVerdicts([], { ...baseAuth, dmarc: 'fail' })
    expect(v.level).toBe('red')
    expect(v.label.toLowerCase()).toContain('dmarc')
  })

  it('returns red when SPF fails', () => {
    const v = combineVerdicts([], { ...baseAuth, spf: 'fail' })
    expect(v.level).toBe('red')
    expect(v.label.toLowerCase()).toContain('spf')
  })

  it('keeps heuristic red even when auth passes (display-name spoof from passing gmail)', () => {
    const v = combineVerdicts(
      [{ kind: 'freemail_impersonation', brandKeyword: 'stripe', fromDomain: 'gmail.com' }],
      { ...baseAuth, headerFrom: 'gmail.com', dkimDomain: 'gmail.com' },
    )
    expect(v.level).toBe('red')
    expect(v.source).toBe('combined')
  })

  it('downgrades heuristic amber to green when auth passes', () => {
    const v = combineVerdicts(
      [{ kind: 'cross_domain_reply', senderDomain: 'a.com', originalRecipientDomain: 'b.com' }],
      baseAuth,
    )
    expect(v.level).toBe('green')
  })

  it('keeps amber when auth is also amber', () => {
    const v = combineVerdicts(
      [{ kind: 'cross_domain_reply', senderDomain: 'a.com', originalRecipientDomain: 'b.com' }],
      { ...baseAuth, dmarc: null },
    )
    expect(v.level).toBe('amber')
  })

  it('always reports auth-red regardless of heuristic state', () => {
    const v = combineVerdicts([], { ...baseAuth, dkim: 'fail', dmarc: 'fail' })
    expect(v.level).toBe('red')
  })
})
