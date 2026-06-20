import {
  clearTemplatesCache,
  clearTrackedThreads,
  logout as serverLogout,
} from './api'
import { clearPendingVerify, clearSession } from './auth-store'
import { clearBadge } from './badge'
import { cancelAll as cancelAllScheduled, listPending } from './scheduled'
import { clearTokens as clearGoogleTokens } from './spoof/google-oauth'

/**
 * Clears every piece of per-account state the extension keeps locally:
 *   - server logout (best-effort, ignores network errors)
 *   - auth session in chrome.storage.local
 *   - pending-verify state (sign-in code in flight)
 *   - templates cache (mf.templatesCache)
 *   - tracked threads set (mf.trackedThreads) — reply detection
 *   - scheduled sends queue + their chrome.alarms entries
 *
 * Intentionally does NOT clear mf.seenOnboarding — that's a device-
 * preference, not account state.
 */
export async function performSignOut(): Promise<void> {
  await serverLogout().catch(() => undefined)
  await clearSession().catch(() => undefined)
  await clearPendingVerify().catch(() => undefined)
  await clearTemplatesCache().catch(() => undefined)
  await clearTrackedThreads().catch(() => undefined)
  await cancelAllScheduled().catch(() => undefined)
  await clearBadge().catch(() => undefined)
  await clearGoogleTokens().catch(() => undefined)
}

/**
 * Same cleanup but skips the server logout. Used when the verify flow
 * lands a session for a different email than the one currently signed
 * in — the prior account's caches must be flushed before we write the
 * new session, but its server-side session is still valid and the user
 * may want to keep it logged in on other devices.
 */
export async function clearLocalAccountState(): Promise<void> {
  await clearTemplatesCache().catch(() => undefined)
  await clearTrackedThreads().catch(() => undefined)
  await cancelAllScheduled().catch(() => undefined)
  await clearBadge().catch(() => undefined)
  await clearGoogleTokens().catch(() => undefined)
}

/** How many scheduled sends are still queued — used by the popup to
 *  warn the user before sign-out if any would be lost. */
export async function pendingSendCount(): Promise<number> {
  try {
    const pending = await listPending()
    return pending.length
  } catch {
    return 0
  }
}
