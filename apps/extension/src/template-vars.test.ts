import { describe, expect, it } from 'vitest'
import { hasTemplateVars, substituteVars } from './template-vars'

describe('hasTemplateVars', () => {
  it('returns true for any {{token}}', () => {
    expect(hasTemplateVars('Hi {{name}}')).toBe(true)
    expect(hasTemplateVars('Hi {{first_name}}, from {{company}}')).toBe(true)
  })
  it('returns false for plain text', () => {
    expect(hasTemplateVars('Hi Alice')).toBe(false)
    expect(hasTemplateVars('')).toBe(false)
  })
  it('returns false for malformed brackets', () => {
    expect(hasTemplateVars('Hi {name}')).toBe(false)
    expect(hasTemplateVars('Hi {{name')).toBe(false)
  })
})

describe('substituteVars', () => {
  it('replaces {{name}} with display name', () => {
    expect(
      substituteVars('Hi {{name}}', { name: 'Alice Smith', address: 'alice@example.com' }),
    ).toBe('Hi Alice Smith')
  })

  it('replaces {{first_name}} with first whitespace-separated token', () => {
    expect(
      substituteVars('Hi {{first_name}}', {
        name: 'Alice Smith',
        address: 'alice@example.com',
      }),
    ).toBe('Hi Alice')
  })

  it('falls back to title-cased local-part when name is missing', () => {
    expect(
      substituteVars('Hi {{first_name}}', { address: 'john.doe@example.com' }),
    ).toBe('Hi John')
  })

  it('derives {{company}} from email domain', () => {
    expect(
      substituteVars('At {{company}}!', { name: 'Alice', address: 'alice@stripe.com' }),
    ).toBe('At Stripe!')
  })

  it('handles ESP subdomains by taking the org segment closest to the suffix', () => {
    // mail.google.com → "Google" (subdomain + org + tld → org wins)
    expect(
      substituteVars('At {{company}}!', {
        name: 'Alice',
        address: 'alice@mail.google.com',
      }),
    ).toBe('At Google!')
  })

  it('leaves unknown tokens literal so typos are visible', () => {
    expect(
      substituteVars('Hi {{nope}}', {
        name: 'Alice',
        address: 'alice@example.com',
      }),
    ).toBe('Hi {{nope}}')
  })

  it('escapes HTML in display name (XSS-safe)', () => {
    const out = substituteVars('Hi {{name}}', {
      name: '<script>alert(1)</script>',
      address: 'x@example.com',
    })
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('handles repeated substitutions in one pass', () => {
    // Note: only the substituted *values* are HTML-escaped. The
    // surrounding template (including any literal < or > the user
    // typed) is passed through unchanged.
    expect(
      substituteVars('{{first_name}} from {{company}} ({{first_name}})', {
        name: 'Alice Smith',
        address: 'alice@stripe.com',
      }),
    ).toBe('Alice from Stripe (Alice)')
  })
})
