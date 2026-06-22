import { describe, expect, it } from 'vitest'
import {
  detectBrandImpersonation,
  detectCrossDomainReply,
  parseSender,
} from './heuristics'

describe('parseSender', () => {
  it('parses object form', () => {
    const s = parseSender({ name: 'Alice', address: 'alice@example.com' })
    expect(s).toEqual({
      displayName: 'Alice',
      address: 'alice@example.com',
      domain: 'example.com',
    })
  })

  it('parses RFC-5322 "Name <addr>" string', () => {
    const s = parseSender('"Alice Smith" <alice@example.com>')
    expect(s?.displayName).toBe('Alice Smith')
    expect(s?.domain).toBe('example.com')
  })

  it('parses bare address string', () => {
    const s = parseSender('bob@example.com')
    expect(s?.displayName).toBeNull()
    expect(s?.domain).toBe('example.com')
  })

  it('returns null on invalid input', () => {
    expect(parseSender({ name: '', address: '' })).toBeNull()
    expect(parseSender({ name: 'x', address: 'no-at-sign' })).toBeNull()
    expect(parseSender('')).toBeNull()
  })

  it('treats empty/whitespace display name as null', () => {
    const s = parseSender({ name: '   ', address: 'alice@example.com' })
    expect(s?.displayName).toBeNull()
  })

  it('lowercases the domain', () => {
    const s = parseSender({ name: 'Alice', address: 'alice@EXAMPLE.COM' })
    expect(s?.domain).toBe('example.com')
  })
})

describe('detectBrandImpersonation', () => {
  it('returns null for senders with no display name', () => {
    expect(
      detectBrandImpersonation({
        displayName: null,
        address: 'alice@example.com',
        domain: 'example.com',
      }),
    ).toBeNull()
  })

  it('returns null when display name has no known brand keyword', () => {
    expect(
      detectBrandImpersonation({
        displayName: 'Alice Smith',
        address: 'alice@example.com',
        domain: 'example.com',
      }),
    ).toBeNull()
  })

  it('returns null when domain matches the brand allowlist (suffix match)', () => {
    expect(
      detectBrandImpersonation({
        displayName: 'Stripe Receipts',
        address: 'noreply@em.stripe.com',
        domain: 'em.stripe.com',
      }),
    ).toBeNull()
  })

  it('returns freemail_impersonation for brand keyword + free-mail domain', () => {
    const signal = detectBrandImpersonation({
      displayName: 'Stripe Support',
      address: 'fake@gmail.com',
      domain: 'gmail.com',
    })
    expect(signal?.kind).toBe('freemail_impersonation')
    if (signal?.kind === 'freemail_impersonation') {
      expect(signal.brandKeyword).toBe('stripe')
      expect(signal.fromDomain).toBe('gmail.com')
    }
  })

  it('returns display_name_mismatch for brand keyword + non-matching corporate domain', () => {
    const signal = detectBrandImpersonation({
      displayName: 'Bank of America',
      address: 'alerts@imposter-bofa.tld',
      domain: 'imposter-bofa.tld',
    })
    expect(signal?.kind).toBe('display_name_mismatch')
  })

  it('matches brand keywords as whole words only', () => {
    // "applesauce" should NOT trigger "apple"
    expect(
      detectBrandImpersonation({
        displayName: 'Applesauce Recipes',
        address: 'noreply@applesauce.example',
        domain: 'applesauce.example',
      }),
    ).toBeNull()
  })

  it('does NOT trigger on "meta" as a generic English word (keyword removed)', () => {
    expect(
      detectBrandImpersonation({
        displayName: 'Meta Description Tips',
        address: 'newsletter@somenewsletter.com',
        domain: 'somenewsletter.com',
      }),
    ).toBeNull()
  })
})

describe('detectCrossDomainReply', () => {
  it('returns null when domains match', () => {
    expect(detectCrossDomainReply('acme.com', 'acme.com')).toBeNull()
  })

  it('returns null when one side is a subdomain of the other', () => {
    expect(detectCrossDomainReply('us.acme.com', 'acme.com')).toBeNull()
    expect(detectCrossDomainReply('acme.com', 'us.acme.com')).toBeNull()
  })

  it('returns null when both sides are free-mail (signal noise)', () => {
    expect(detectCrossDomainReply('gmail.com', 'outlook.com')).toBeNull()
    expect(detectCrossDomainReply('gmail.com', 'gmail.com')).toBeNull()
  })

  it('returns null when one side is empty', () => {
    expect(detectCrossDomainReply('', 'acme.com')).toBeNull()
    expect(detectCrossDomainReply('acme.com', '')).toBeNull()
  })

  it('returns a cross_domain_reply signal when domains differ + both are corporate', () => {
    const s = detectCrossDomainReply('newcorp.com', 'acme.com')
    expect(s?.kind).toBe('cross_domain_reply')
    if (s?.kind === 'cross_domain_reply') {
      expect(s.senderDomain).toBe('newcorp.com')
      expect(s.originalRecipientDomain).toBe('acme.com')
    }
  })

  it('lowercases inputs', () => {
    const s = detectCrossDomainReply('NEWCORP.COM', 'ACME.COM')
    expect(s?.kind).toBe('cross_domain_reply')
    if (s?.kind === 'cross_domain_reply') {
      expect(s.senderDomain).toBe('newcorp.com')
    }
  })
})
