/**
 * Static brand and free-mail data for the heuristic spoof detector.
 *
 * BRAND_KEYWORDS — substrings (lowercased) we look for in the sender's
 * display name. If a sender claims to be a known brand but the From
 * address domain isn't on that brand's allowlist, we flag it.
 *
 * BRAND_DOMAINS — keyword → set of legitimate sending domains. Includes
 * the ESP subdomains brands actually use (em.stripe.com, mail.notion.so
 * etc.) so legitimate marketing mail doesn't trip the alarm.
 *
 * FREEMAIL_DOMAINS — providers that should never be a corporate sender.
 * A display name with a brand keyword + a freemail From is the highest-
 * confidence consumer phishing signal we have.
 */

export const FREEMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'tutanota.com',
  'tuta.io',
  'fastmail.com',
  'yandex.com',
  'yandex.ru',
])

export interface BrandEntry {
  /** Lowercased substring to look for in display name. */
  keyword: string
  /** Domains the brand legitimately sends from. Exact match OR suffix
   *  match (".stripe.com" matches "em.stripe.com"). */
  domains: ReadonlyArray<string>
}

export const BRANDS: ReadonlyArray<BrandEntry> = [
  // Payments / banks
  { keyword: 'stripe', domains: ['stripe.com'] },
  { keyword: 'paypal', domains: ['paypal.com'] },
  { keyword: 'venmo', domains: ['venmo.com'] },
  { keyword: 'square', domains: ['squareup.com', 'square.com'] },
  { keyword: 'wise', domains: ['wise.com', 'transferwise.com'] },
  { keyword: 'coinbase', domains: ['coinbase.com'] },
  { keyword: 'kraken', domains: ['kraken.com'] },
  { keyword: 'binance', domains: ['binance.com', 'binance.us'] },
  { keyword: 'robinhood', domains: ['robinhood.com'] },
  { keyword: 'chase', domains: ['chase.com', 'jpmorganchase.com'] },
  { keyword: 'bank of america', domains: ['bankofamerica.com', 'bofa.com'] },
  { keyword: 'wells fargo', domains: ['wellsfargo.com'] },
  { keyword: 'citi', domains: ['citi.com', 'citibank.com'] },
  { keyword: 'capital one', domains: ['capitalone.com'] },
  { keyword: 'american express', domains: ['americanexpress.com', 'aexp.com'] },
  { keyword: 'amex', domains: ['americanexpress.com', 'aexp.com'] },

  // Big tech
  { keyword: 'microsoft', domains: ['microsoft.com', 'office.com', 'live.com'] },
  { keyword: 'apple', domains: ['apple.com', 'icloud.com'] },
  { keyword: 'google', domains: ['google.com', 'gmail.com', 'youtube.com'] },
  { keyword: 'amazon', domains: ['amazon.com', 'amazon.co.uk'] },
  // 'meta' as a standalone keyword is too generic ("meta description",
  // "Metabase", etc.) — rely on facebook/instagram/whatsapp to catch
  // brand impersonation of Meta properties.
  { keyword: 'facebook', domains: ['facebook.com', 'meta.com'] },
  { keyword: 'instagram', domains: ['instagram.com', 'meta.com'] },
  { keyword: 'whatsapp', domains: ['whatsapp.com', 'meta.com'] },
  { keyword: 'linkedin', domains: ['linkedin.com'] },
  { keyword: 'github', domains: ['github.com'] },
  { keyword: 'openai', domains: ['openai.com'] },
  { keyword: 'anthropic', domains: ['anthropic.com'] },
  { keyword: 'twitter', domains: ['twitter.com', 'x.com'] },

  // Subscription / media
  { keyword: 'netflix', domains: ['netflix.com'] },
  { keyword: 'spotify', domains: ['spotify.com'] },
  { keyword: 'youtube', domains: ['youtube.com', 'google.com'] },
  { keyword: 'disney', domains: ['disney.com', 'disneyplus.com'] },
  { keyword: 'hulu', domains: ['hulu.com'] },

  // SaaS / dev
  { keyword: 'notion', domains: ['notion.so', 'notion.com'] },
  { keyword: 'slack', domains: ['slack.com'] },
  { keyword: 'zoom', domains: ['zoom.us', 'zoom.com'] },
  { keyword: 'dropbox', domains: ['dropbox.com'] },
  { keyword: 'docusign', domains: ['docusign.com', 'docusign.net'] },
  { keyword: 'hellosign', domains: ['hellosign.com', 'dropbox.com'] },
  { keyword: 'figma', domains: ['figma.com'] },
  { keyword: 'canva', domains: ['canva.com'] },
  { keyword: 'shopify', domains: ['shopify.com'] },
  { keyword: 'mailfalcon', domains: ['mailfalcon.app'] },

  // Shipping / government
  { keyword: 'fedex', domains: ['fedex.com'] },
  { keyword: 'ups', domains: ['ups.com'] },
  { keyword: 'usps', domains: ['usps.com', 'usps.gov'] },
  { keyword: 'dhl', domains: ['dhl.com'] },
  { keyword: 'irs', domains: ['irs.gov'] },
  { keyword: 'social security', domains: ['ssa.gov'] },
  { keyword: 'medicare', domains: ['medicare.gov', 'cms.gov'] },

  // Travel
  { keyword: 'airbnb', domains: ['airbnb.com'] },
  { keyword: 'uber', domains: ['uber.com'] },
  { keyword: 'lyft', domains: ['lyft.com'] },
  { keyword: 'booking.com', domains: ['booking.com'] },
  { keyword: 'expedia', domains: ['expedia.com'] },

  // Misc commonly impersonated
  { keyword: 'ebay', domains: ['ebay.com'] },
  { keyword: 'walmart', domains: ['walmart.com'] },
  { keyword: 'target', domains: ['target.com'] },
  { keyword: 'best buy', domains: ['bestbuy.com'] },
]

/**
 * Check if a domain matches any of the brand's known sending domains.
 * Supports exact match (`stripe.com` matches `stripe.com`) or
 * suffix-on-dot match (`em.stripe.com` matches `stripe.com`).
 */
export function domainMatchesBrand(
  fromDomain: string,
  brandDomains: ReadonlyArray<string>,
): boolean {
  const d = fromDomain.toLowerCase()
  for (const allowed of brandDomains) {
    const a = allowed.toLowerCase()
    if (d === a) return true
    if (d.endsWith(`.${a}`)) return true
  }
  return false
}

/**
 * Find the first brand entry whose keyword appears as a whole-word
 * match in the lowercased display name. Returns null if none match.
 */
export function findBrandInDisplayName(displayName: string): BrandEntry | null {
  const lower = displayName.toLowerCase()
  for (const brand of BRANDS) {
    // Whole-word check so "applesauce" doesn't match brand "apple".
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(brand.keyword)}(?:[^a-z0-9]|$)`)
    if (re.test(lower)) return brand
  }
  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
