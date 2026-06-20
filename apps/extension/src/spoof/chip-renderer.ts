import type { SpoofVerdict } from './verdict'

const MARKER_ATTR = 'data-mf-spoof'

const STYLES: Record<
  'green' | 'amber' | 'red',
  { bg: string; fg: string; border: string }
> = {
  green: { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0' },
  amber: { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  red: { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
}

/**
 * Insert (or update) a spoof chip inside the message view. Idempotent —
 * re-rendering the same message twice does not duplicate the chip.
 * Returns false if it couldn't find a suitable anchor.
 */
export function renderSpoofChip(
  viewElement: HTMLElement | null,
  verdict: SpoofVerdict,
): boolean {
  if (!viewElement) return false
  // Remove any existing chip we previously rendered so the new verdict
  // (e.g. heuristic getting upgraded by Phase B auth-results later)
  // wins cleanly.
  const previous = viewElement.querySelector(`[${MARKER_ATTR}]`)
  if (previous) previous.remove()

  if (verdict.level === 'none') return true

  const anchor = findAnchor(viewElement)
  if (!anchor) return false

  const style = STYLES[verdict.level]
  const chip = document.createElement('span')
  chip.setAttribute(MARKER_ATTR, verdict.level)
  chip.title = verdict.tooltip
  chip.textContent = verdict.label
  chip.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'margin-left:8px',
    'padding:2px 8px',
    'border-radius:9999px',
    'font:600 11px ui-sans-serif,system-ui,sans-serif',
    'line-height:1.4',
    `background:${style.bg}`,
    `color:${style.fg}`,
    `border:1px solid ${style.border}`,
    'vertical-align:middle',
    'cursor:help',
    'white-space:nowrap',
  ].join(';')

  anchor.appendChild(chip)
  return true
}

/**
 * Find a stable place inside the message header to attach the chip.
 * Gmail's DOM uses obfuscated class names; we try a few known anchors
 * and fall back to the first heading-like element.
 */
function findAnchor(viewElement: HTMLElement): HTMLElement | null {
  // .gD is Gmail's "sender chip" wrapper (display name + email). Has
  // been stable for years.
  const senderRow = viewElement.querySelector<HTMLElement>('.gD')
  if (senderRow && senderRow.parentElement) return senderRow.parentElement

  // .go is the parenthesized email span next to the sender.
  const goRow = viewElement.querySelector<HTMLElement>('.go')
  if (goRow && goRow.parentElement) return goRow.parentElement

  // Generic header heading fallback.
  const heading = viewElement.querySelector<HTMLElement>('[role="heading"]')
  if (heading) return heading

  return null
}
