import { describe, expect, it } from 'vitest'
import { evaluateDeliverability } from './preflight'

describe('evaluateDeliverability', () => {
  it('gives high score to clean conversational email', async () => {
    const res = await evaluateDeliverability(
      'Quick sync regarding project roadmap',
      '<p>Hi Sarah, would love to catch up tomorrow at 2pm if you are available.</p>',
    )
    expect(res.score).toBeGreaterThanOrEqual(90)
    expect(res.rating).toBe('great')
    expect(res.spamWordsFound).toHaveLength(0)
  })

  it('detects high-risk spam keywords', async () => {
    const res = await evaluateDeliverability(
      'Claim your 100% free cash bonus now!',
      '<p>Act now to earn extra cash fast! Guaranteed satisfaction and risk free money.</p>',
    )
    expect(res.score).toBeLessThan(75)
    expect(res.spamWordsFound.length).toBeGreaterThan(2)
    expect(res.suggestions.length).toBeGreaterThan(0)
  })

  it('flags all-caps subject lines and excessive punctuation', async () => {
    const res = await evaluateDeliverability(
      'URGENT: WINNER SELECTED!!!',
      '<p>You have been selected for an exclusive deal.</p>',
    )
    expect(res.checks.some((c) => c.id === 'subject_caps' && !c.passed)).toBe(true)
    expect(res.checks.some((c) => c.id === 'subject_punctuation' && !c.passed)).toBe(true)
  })

  it('flags raw IP address links', async () => {
    const res = await evaluateDeliverability(
      'Security verification update',
      '<p>Click here to verify: <a href="http://192.168.1.1/login">Login</a></p>',
    )
    expect(res.checks.some((c) => c.id === 'ip_links' && !c.passed)).toBe(true)
  })
})
