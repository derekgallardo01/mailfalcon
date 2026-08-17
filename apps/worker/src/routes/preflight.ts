import { Hono } from 'hono'
import { z } from 'zod'
import { type Variables } from '../lib/auth-middleware'

type Bindings = {
  ENVIRONMENT: string
}

export const preflightRouter = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

const SPAM_TRIGGER_WORDS = [
  '100% free',
  'act now',
  'apply now',
  'as seen on',
  'buy direct',
  'cash bonus',
  'claim now',
  'clearance',
  'congratulations',
  'credit card offers',
  'cure',
  'dear friend',
  'direct marketing',
  'double your income',
  'earn extra cash',
  'earn money',
  'eliminate debt',
  'exclusive deal',
  'expect to earn',
  'extra income',
  'fast cash',
  'financial freedom',
  'free bonus',
  'free consultation',
  'free gift',
  'free info',
  'free investment',
  'free membership',
  'free money',
  'free preview',
  'free sample',
  'free trial',
  'full refund',
  'get out of debt',
  'get paid',
  'giveaway',
  'guaranteed',
  'increase sales',
  'instant',
  'investment',
  'limited time',
  'lowest price',
  'make money',
  'miracle',
  'money back',
  'mortgage',
  'multi-level marketing',
  'no catch',
  'no cost',
  'no credit check',
  'no experience',
  'no fees',
  'no gimmick',
  'no hidden costs',
  'no obligation',
  'no purchase necessary',
  'no risk',
  'no strings attached',
  'not spam',
  'once in a lifetime',
  'one time',
  'online marketing',
  'open immediately',
  'order now',
  'passwords',
  'pennies a day',
  'pure profit',
  'risk free',
  'satisfaction guaranteed',
  'save big',
  'special promotion',
  'unlimited',
  'urgent',
  'vacation',
  'valuable',
  'viagra',
  'vicodin',
  'warranty',
  'while supplies last',
  'win',
  'winner',
  'winning',
  'wire transfer',
  'work from home',
  'you have been selected',
]

const preflightSchema = z.object({
  subject: z.string().optional().default(''),
  bodyHtml: z.string().optional().default(''),
  fromAddress: z.string().optional().default(''),
  toAddresses: z.array(z.string()).optional().default([]),
})

export interface PreflightCheck {
  id: string
  name: string
  passed: boolean
  impact: 'high' | 'medium' | 'low'
  message: string
}

export interface PreflightResult {
  score: number // 0-100
  rating: 'great' | 'good' | 'warning' | 'poor'
  checks: PreflightCheck[]
  spamWordsFound: string[]
  suggestions: string[]
}

async function checkDnsTxt(name: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
      {
        headers: { Accept: 'application/dns-json' },
      },
    )
    if (!res.ok) return []
    const json = (await res.json()) as { Answer?: { data?: string }[] }
    return (json.Answer ?? []).map((a) => (a.data ?? '').replace(/^"|"$/g, ''))
  } catch {
    return []
  }
}

export async function evaluateDeliverability(
  subject: string,
  bodyHtml: string,
  fromAddress?: string,
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const suggestions: string[] = []
  const spamWordsFound: string[] = []
  let score = 100

  const plainText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const lowerBody = plainText.toLowerCase()
  const lowerSubject = subject.toLowerCase()

  // 1. Spam trigger words check
  for (const word of SPAM_TRIGGER_WORDS) {
    if (lowerSubject.includes(word) || lowerBody.includes(word)) {
      spamWordsFound.push(word)
    }
  }

  if (spamWordsFound.length === 0) {
    checks.push({
      id: 'spam_keywords',
      name: 'Spam Trigger Keywords',
      passed: true,
      impact: 'high',
      message: 'No aggressive spam keywords detected.',
    })
  } else {
    score -= Math.min(30, spamWordsFound.length * 8)
    checks.push({
      id: 'spam_keywords',
      name: 'Spam Trigger Keywords',
      passed: false,
      impact: 'high',
      message: `Found ${spamWordsFound.length} spam-associated term(s): "${spamWordsFound.slice(0, 3).join('", "')}"${spamWordsFound.length > 3 ? '...' : ''}`,
    })
    suggestions.push(
      `Remove high-risk spam keywords: ${spamWordsFound.slice(0, 4).join(', ')}`,
    )
  }

  // 2. Subject Line Checks
  if (!subject.trim()) {
    score -= 20
    checks.push({
      id: 'subject_presence',
      name: 'Subject Line Present',
      passed: false,
      impact: 'high',
      message: 'Email subject is empty.',
    })
    suggestions.push('Add a concise and descriptive subject line.')
  } else {
    // Uppercase check
    const uppercaseLetters = (subject.match(/[A-Z]/g) || []).length
    const totalLetters = (subject.match(/[a-zA-Z]/g) || []).length
    const isAllCaps = totalLetters > 4 && uppercaseLetters / totalLetters > 0.45

    if (isAllCaps) {
      score -= 15
      checks.push({
        id: 'subject_caps',
        name: 'Subject Capitalization',
        passed: false,
        impact: 'medium',
        message: 'Subject has excessive capital letters.',
      })
      suggestions.push('Avoid using ALL CAPS in the subject line.')
    } else {
      checks.push({
        id: 'subject_caps',
        name: 'Subject Capitalization',
        passed: true,
        impact: 'medium',
        message: 'Natural capitalization used.',
      })
    }

    // Exclamation / Question marks
    const exclamationCount = (subject.match(/!/g) || []).length
    if (exclamationCount > 1 || subject.includes('!!!') || subject.includes('???')) {
      score -= 10
      checks.push({
        id: 'subject_punctuation',
        name: 'Subject Punctuation',
        passed: false,
        impact: 'medium',
        message: 'Multiple exclamation marks detected in subject.',
      })
      suggestions.push('Avoid multiple exclamation marks in the subject line.')
    } else {
      checks.push({
        id: 'subject_punctuation',
        name: 'Subject Punctuation',
        passed: true,
        impact: 'low',
        message: 'Clean punctuation in subject line.',
      })
    }
  }

  // 3. Link-to-Text & HTML checks
  const linkMatches = bodyHtml.match(/href=["'](http[^"']+)["']/gi) || []
  const linkCount = linkMatches.length
  const wordCount = plainText.split(/\s+/).filter(Boolean).length

  if (linkCount > 0 && wordCount < linkCount * 6 && wordCount < 50) {
    score -= 15
    checks.push({
      id: 'link_density',
      name: 'Link-to-Text Balance',
      passed: false,
      impact: 'medium',
      message: 'High link density compared to message body length.',
    })
    suggestions.push('Add more conversational text context around links.')
  } else {
    checks.push({
      id: 'link_density',
      name: 'Link-to-Text Balance',
      passed: true,
      impact: 'low',
      message: 'Healthy ratio of text to hyperlinks.',
    })
  }

  // Check for raw IP links
  if (/href=["']https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i.test(bodyHtml)) {
    score -= 25
    checks.push({
      id: 'ip_links',
      name: 'Domain-based URLs',
      passed: false,
      impact: 'high',
      message: 'Raw IP address detected in link URLs (triggers anti-phishing filters).',
    })
    suggestions.push('Replace IP address links with secure domain names (HTTPS).')
  } else {
    checks.push({
      id: 'ip_links',
      name: 'Domain-based URLs',
      passed: true,
      impact: 'high',
      message: 'All links use named domains.',
    })
  }

  // 4. DNS Authentication Check (if fromAddress provided)
  if (fromAddress && fromAddress.includes('@')) {
    const domain = fromAddress.split('@')[1]!.trim().toLowerCase()
    const freemails = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com']
    
    if (!freemails.includes(domain)) {
      const [spfRecords, dmarcRecords] = await Promise.all([
        checkDnsTxt(domain),
        checkDnsTxt(`_dmarc.${domain}`),
      ])

      const hasSpf = spfRecords.some((r) => r.toLowerCase().includes('v=spf1'))
      const hasDmarc = dmarcRecords.some((r) => r.toLowerCase().includes('v=dmarc1'))

      if (hasSpf) {
        checks.push({
          id: 'dns_spf',
          name: 'Domain SPF Record',
          passed: true,
          impact: 'high',
          message: `SPF record found on ${domain}.`,
        })
      } else {
        score -= 15
        checks.push({
          id: 'dns_spf',
          name: 'Domain SPF Record',
          passed: false,
          impact: 'high',
          message: `No SPF record configured for ${domain}.`,
        })
        suggestions.push(`Add an SPF TXT record to ${domain} to prevent spoofing.`)
      }

      if (hasDmarc) {
        checks.push({
          id: 'dns_dmarc',
          name: 'Domain DMARC Record',
          passed: true,
          impact: 'medium',
          message: `DMARC record found on _dmarc.${domain}.`,
        })
      } else {
        score -= 10
        checks.push({
          id: 'dns_dmarc',
          name: 'Domain DMARC Record',
          passed: false,
          impact: 'medium',
          message: `No DMARC policy configured for ${domain}.`,
        })
        suggestions.push(`Configure a DMARC policy TXT record on _dmarc.${domain}.`)
      }
    }
  }

  const finalScore = Math.max(10, Math.min(100, score))
  let rating: PreflightResult['rating'] = 'great'
  if (finalScore < 60) rating = 'poor'
  else if (finalScore < 80) rating = 'warning'
  else if (finalScore < 90) rating = 'good'

  return {
    score: finalScore,
    rating,
    checks,
    spamWordsFound,
    suggestions,
  }
}

preflightRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = preflightSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.issues }, 400)
  }

  const result = await evaluateDeliverability(
    parsed.data.subject,
    parsed.data.bodyHtml,
    parsed.data.fromAddress,
  )

  return c.json(result)
})
