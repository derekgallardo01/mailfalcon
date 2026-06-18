/**
 * Action-icon badge with the day's non-bot open + click + reply count.
 *
 * Why peripheral, not perfect: the SW restarts a lot (Chrome's
 * aggressive lifecycle), so the count lives in chrome.storage.local
 * keyed by UTC date. Each event handler calls bumpBadge(); the badge
 * itself is repainted on every bump and at SW startup so a restart
 * doesn't leave a stale value.
 */

const BADGE_STATE_KEY = 'mf.badgeState'
const BADGE_COLOR = '#10b981' // emerald-500

interface BadgeState {
  day: string // YYYY-MM-DD (UTC)
  count: number
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readState(): Promise<BadgeState> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { day: todayKey(), count: 0 }
  }
  try {
    const stored = await chrome.storage.local.get(BADGE_STATE_KEY)
    const raw = stored[BADGE_STATE_KEY] as BadgeState | undefined
    if (!raw) return { day: todayKey(), count: 0 }
    // Roll the counter when UTC day changes.
    if (raw.day !== todayKey()) return { day: todayKey(), count: 0 }
    return raw
  } catch {
    return { day: todayKey(), count: 0 }
  }
}

async function writeState(state: BadgeState): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local
    .set({ [BADGE_STATE_KEY]: state })
    .catch(() => undefined)
}

function paint(count: number): void {
  if (typeof chrome === 'undefined' || !chrome.action) return
  // Chrome caps badge text at 4 visible chars; we cap at "99+" for clarity.
  const text = count === 0 ? '' : count > 99 ? '99+' : String(count)
  void chrome.action.setBadgeText({ text }).catch(() => undefined)
}

/** Call once at SW startup so the badge survives a restart. */
export async function initBadge(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return
  await chrome.action
    .setBadgeBackgroundColor({ color: BADGE_COLOR })
    .catch(() => undefined)
  const state = await readState()
  paint(state.count)
  // If the day rolled, persist the zeroed counter.
  if (state.count === 0) await writeState(state)
}

/** Increment the day's counter and repaint. Idempotent re: day rollover. */
export async function bumpBadge(): Promise<void> {
  const state = await readState()
  const next: BadgeState = { day: state.day, count: state.count + 1 }
  await writeState(next)
  paint(next.count)
}

/** Reset the count to zero (called on dashboard visit + sign-out). */
export async function clearBadge(): Promise<void> {
  await writeState({ day: todayKey(), count: 0 })
  paint(0)
}
