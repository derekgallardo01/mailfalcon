import { describe, expect, it } from 'vitest'
import {
  BRANDS,
  FREEMAIL_DOMAINS,
  domainMatchesBrand,
  findBrandInDisplayName,
} from './known-brands'

describe('FREEMAIL_DOMAINS', () => {
  it('includes the major free providers', () => {
    expect(FREEMAIL_DOMAINS.has('gmail.com')).toBe(true)
    expect(FREEMAIL_DOMAINS.has('outlook.com')).toBe(true)
    expect(FREEMAIL_DOMAINS.has('yahoo.com')).toBe(true)
    expect(FREEMAIL_DOMAINS.has('proton.me')).toBe(true)
    expect(FREEMAIL_DOMAINS.has('icloud.com')).toBe(true)
  })
  it('does NOT include corporate domains', () => {
    expect(FREEMAIL_DOMAINS.has('acme.com')).toBe(false)
    expect(FREEMAIL_DOMAINS.has('stripe.com')).toBe(false)
  })
})

describe('domainMatchesBrand', () => {
  it('exact match', () => {
    expect(domainMatchesBrand('stripe.com', ['stripe.com'])).toBe(true)
  })
  it('suffix match (subdomain of brand domain)', () => {
    expect(domainMatchesBrand('em.stripe.com', ['stripe.com'])).toBe(true)
    expect(domainMatchesBrand('news.facebook.com', ['facebook.com'])).toBe(true)
  })
  it('rejects unrelated', () => {
    expect(domainMatchesBrand('stripe.tld', ['stripe.com'])).toBe(false)
    expect(domainMatchesBrand('stripe-fake.com', ['stripe.com'])).toBe(false)
  })
  it('case-insensitive', () => {
    expect(domainMatchesBrand('EM.STRIPE.COM', ['stripe.com'])).toBe(true)
  })
})

describe('findBrandInDisplayName', () => {
  it('finds a brand keyword as a whole word', () => {
    expect(findBrandInDisplayName('Stripe Receipts')?.keyword).toBe('stripe')
    expect(findBrandInDisplayName('Notification from Chase')?.keyword).toBe('chase')
  })
  it('does NOT match brand keyword as a substring', () => {
    // "applesauce" should not match "apple"
    expect(findBrandInDisplayName('Applesauce Newsletter')).toBeNull()
  })
  it('returns null on plain name', () => {
    expect(findBrandInDisplayName('Alice Smith')).toBeNull()
  })
  it('does NOT match the removed "meta" keyword', () => {
    expect(findBrandInDisplayName('Meta description tips')).toBeNull()
  })
  it('matches multi-word brand keywords (e.g. bank of america)', () => {
    expect(findBrandInDisplayName('Bank of America Alerts')?.keyword).toBe(
      'bank of america',
    )
  })
})

describe('BRANDS sanity', () => {
  it('every brand has at least one domain', () => {
    for (const b of BRANDS) {
      expect(b.domains.length).toBeGreaterThan(0)
      expect(b.keyword.length).toBeGreaterThan(0)
      expect(b.keyword).toBe(b.keyword.toLowerCase())
    }
  })
})
