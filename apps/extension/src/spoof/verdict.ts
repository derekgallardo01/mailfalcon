import type { HeuristicSignal } from './heuristics'

export type VerdictLevel = 'none' | 'amber' | 'red'

export interface SpoofVerdict {
  level: VerdictLevel
  /** Short label rendered in the chip. */
  label: string
  /** Longer text shown in the title attribute on hover. */
  tooltip: string
  source: 'heuristic'
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
