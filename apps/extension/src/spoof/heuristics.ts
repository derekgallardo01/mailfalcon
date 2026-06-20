import {
  FREEMAIL_DOMAINS,
  domainMatchesBrand,
  findBrandInDisplayName,
} from './known-brands'

export interface ParsedSender {
  displayName: string | null
  address: string
  domain: string
}

/**
 * Parse a sender into display-name + address + domain. Accepts either a
 * full RFC-5322-ish "Display <addr@host>" string or a pre-split pair
 * from InboxSDK's getSender().
 */
export function parseSender(
  raw: { name?: string | null; address: string } | string,
): ParsedSender | null {
  if (typeof raw === 'string') {
    const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(raw)
    if (m) {
      const display = (m[1] ?? '').trim()
      const addr = m[2]!.trim()
      const domain = addr.split('@')[1]?.toLowerCase() ?? ''
      if (!domain) return null
      return {
        displayName: display.length > 0 ? display : null,
        address: addr,
        domain,
      }
    }
    const addr = raw.trim()
    const domain = addr.split('@')[1]?.toLowerCase() ?? ''
    if (!domain) return null
    return { displayName: null, address: addr, domain }
  }

  const addr = raw.address.trim()
  if (!addr) return null
  const domain = addr.split('@')[1]?.toLowerCase() ?? ''
  if (!domain) return null
  const display = (raw.name ?? '').trim()
  return {
    displayName: display.length > 0 ? display : null,
    address: addr,
    domain,
  }
}

export type HeuristicSignal =
  | {
      kind: 'display_name_mismatch'
      brandKeyword: string
      fromDomain: string
    }
  | {
      kind: 'freemail_impersonation'
      brandKeyword: string
      fromDomain: string
    }
  | {
      kind: 'cross_domain_reply'
      senderDomain: string
      originalRecipientDomain: string
    }

/**
 * Check the sender's display name for a known brand keyword. If found
 * AND the From domain isn't on that brand's allowlist, return a signal.
 *
 * Free-mail providers get a sharper variant ("Bank of America" coming
 * from gmail.com is the textbook consumer phishing pattern, distinct
 * from a generic mismatch like "Stripe" coming from a corporate
 * imitation domain).
 */
export function detectBrandImpersonation(sender: ParsedSender): HeuristicSignal | null {
  if (!sender.displayName) return null
  const brand = findBrandInDisplayName(sender.displayName)
  if (!brand) return null
  if (domainMatchesBrand(sender.domain, brand.domains)) return null
  if (FREEMAIL_DOMAINS.has(sender.domain)) {
    return {
      kind: 'freemail_impersonation',
      brandKeyword: brand.keyword,
      fromDomain: sender.domain,
    }
  }
  return {
    kind: 'display_name_mismatch',
    brandKeyword: brand.keyword,
    fromDomain: sender.domain,
  }
}

/**
 * Compare the inbound sender's domain to the original recipient domain
 * of the tracked thread. Domains we ignore (free-mail) on both sides
 * since "different gmail address" isn't a useful signal — that's
 * just two normal people on Gmail.
 */
export function detectCrossDomainReply(
  senderDomain: string,
  originalRecipientDomain: string,
): HeuristicSignal | null {
  const a = senderDomain.toLowerCase()
  const b = originalRecipientDomain.toLowerCase()
  if (!a || !b) return null
  if (a === b) return null
  if (FREEMAIL_DOMAINS.has(a) || FREEMAIL_DOMAINS.has(b)) return null
  // Subdomain of the same org is fine ("alice@us.acme.com" replying to
  // someone at "acme.com").
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return null
  return {
    kind: 'cross_domain_reply',
    senderDomain: a,
    originalRecipientDomain: b,
  }
}
