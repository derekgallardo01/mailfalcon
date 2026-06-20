import type { AuthResults } from './auth-results-parser'
import type { HeuristicSignal } from './heuristics'

export type VerdictLevel = 'none' | 'green' | 'amber' | 'red'

export interface SpoofVerdict {
  level: VerdictLevel
  /** Short label rendered in the chip. */
  label: string
  /** Longer text shown in the title attribute on hover. */
  tooltip: string
  source: 'heuristic' | 'auth-results' | 'combined'
}

const NONE: SpoofVerdict = {
  level: 'none',
  label: '',
  tooltip: '',
  source: 'heuristic',
}

/**
 * Pick the strongest signal from a list and translate it into a
 * renderable verdict. Order of precedence: freemail impersonation (red)
 * > display-name mismatch (red) > cross-domain reply (amber).
 */
export function verdictFromHeuristics(
  signals: ReadonlyArray<HeuristicSignal>,
): SpoofVerdict {
  if (signals.length === 0) return NONE

  for (const s of signals) {
    if (s.kind === 'freemail_impersonation') {
      return {
        level: 'red',
        label: '⚠ likely spoofed',
        tooltip: `Display name mentions "${s.brandKeyword}" but the email is sent from ${s.fromDomain}, a free-mail provider. Treat with caution.`,
        source: 'heuristic',
      }
    }
  }
  for (const s of signals) {
    if (s.kind === 'display_name_mismatch') {
      return {
        level: 'red',
        label: '⚠ display name mismatch',
        tooltip: `Display name mentions "${s.brandKeyword}" but the email is sent from ${s.fromDomain}, which doesn't match this brand's known sending domains.`,
        source: 'heuristic',
      }
    }
  }
  for (const s of signals) {
    if (s.kind === 'cross_domain_reply') {
      return {
        level: 'amber',
        label: '⚠ different sender domain',
        tooltip: `This reply came from ${s.senderDomain}, not ${s.originalRecipientDomain}, the domain of the original recipient on this thread.`,
        source: 'heuristic',
      }
    }
  }
  return NONE
}

/**
 * Translate Gmail's stamped Authentication-Results into a chip verdict.
 * The authority check (mx.google.com only) already happened in the
 * parser — anything getting here is trustworthy.
 */
function verdictFromAuthResults(auth: AuthResults): SpoofVerdict {
  const failures: string[] = []
  if (auth.dkim === 'fail' || auth.dkim === 'permerror') failures.push('DKIM')
  if (auth.spf === 'fail' || auth.spf === 'permerror') failures.push('SPF')
  if (auth.dmarc === 'fail') failures.push('DMARC')

  if (failures.length > 0) {
    return {
      level: 'red',
      label: `⛔ ${failures[0]} failed`,
      tooltip:
        `Gmail's authentication check reported ${failures.join(', ')} failure. ` +
        'This message is very likely spoofed or forwarded through a broken relay.',
      source: 'auth-results',
    }
  }

  // No DMARC verdict at all = sender hasn't published DMARC. Common for
  // small senders but means receivers can't verify the From domain.
  const dmarcMissing = auth.dmarc === null || auth.dmarc === 'none'
  if (dmarcMissing) {
    return {
      level: 'amber',
      label: '⚠ unverified',
      tooltip:
        'This sender does not have a DMARC policy. Gmail accepted the message but cannot verify the From address is authentic.',
      source: 'auth-results',
    }
  }

  // All clean.
  const headerFrom = auth.headerFrom ? ` (${auth.headerFrom})` : ''
  return {
    level: 'green',
    label: '✓ verified',
    tooltip:
      `Gmail verified SPF, DKIM, and DMARC for this message${headerFrom}.`,
    source: 'auth-results',
  }
}

/**
 * Merge heuristic + authoritative verdicts. Authority wins on the major
 * dial (pass / fail). Heuristic catches things the authoritative result
 * can't (e.g. display-name spoof with DMARC=none — sender truly is
 * gmail.com but is claiming to be Stripe in the name).
 */
export function combineVerdicts(
  heuristics: ReadonlyArray<HeuristicSignal>,
  auth: AuthResults | null | undefined,
): SpoofVerdict {
  const heuristic = verdictFromHeuristics(heuristics)
  if (!auth) return heuristic
  const authVerdict = verdictFromAuthResults(auth)

  // Authoritative red always wins.
  if (authVerdict.level === 'red') return authVerdict

  // Heuristic red holds even when auth-results pass — because a
  // display-name spoof from gmail.com WILL pass SPF/DKIM/DMARC for
  // gmail.com, and the user still wants to be warned.
  if (heuristic.level === 'red') {
    return {
      level: 'red',
      label: heuristic.label,
      tooltip:
        `${heuristic.tooltip} (Gmail's checks pass for the sending domain itself — ` +
        'this warning is about the display name claiming a different brand.)',
      source: 'combined',
    }
  }

  // Auth amber, heuristic clean → amber.
  if (authVerdict.level === 'amber') return authVerdict

  // Auth green, heuristic amber → green (auth wins — the sender domain
  // checks out even if the reply was cross-domain).
  return authVerdict
}
