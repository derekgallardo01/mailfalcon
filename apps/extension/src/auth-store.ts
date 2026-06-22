const TOKEN_KEY = 'mf.token'
const EMAIL_KEY = 'mf.email'
const USER_ID_KEY = 'mf.userId'
const PENDING_KEY = 'mf.pendingVerify'
const ONBOARDING_KEY = 'mf.seenOnboarding'
const INSTALL_ID_KEY = 'mf.installId'

const PENDING_TTL_MS = 15 * 60 * 1000

function randomInstallId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Fallback for runtimes without randomUUID (very old browsers) —
    // 16 random bytes, base16 with dashes shaped like a UUID v4.
    const buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

/** Returns the device-scoped install id, generating + persisting one
 *  on first call. Used as a stable identifier for admin telemetry —
 *  survives sign-out but resets on extension reinstall (since
 *  chrome.storage.local is wiped on uninstall). */
export async function ensureInstallId(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return randomInstallId()
  }
  const stored = await chrome.storage.local.get(INSTALL_ID_KEY)
  const existing = stored[INSTALL_ID_KEY] as string | undefined
  if (existing) return existing
  const fresh = randomInstallId()
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: fresh })
  return fresh
}

export interface Session {
  token: string
  email: string
  userId: string
}

export interface PendingVerify {
  email: string
  requestedAt: number
}

export async function getSession(): Promise<Session | null> {
  const result = await chrome.storage.local.get([TOKEN_KEY, EMAIL_KEY, USER_ID_KEY])
  const token = result[TOKEN_KEY] as string | undefined
  const email = result[EMAIL_KEY] as string | undefined
  const userId = result[USER_ID_KEY] as string | undefined
  if (!token || !email || !userId) return null
  return { token, email, userId }
}

export async function setSession(s: Session): Promise<void> {
  await chrome.storage.local.set({
    [TOKEN_KEY]: s.token,
    [EMAIL_KEY]: s.email,
    [USER_ID_KEY]: s.userId,
  })
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, EMAIL_KEY, USER_ID_KEY])
}

export async function setPendingVerify(email: string): Promise<void> {
  const v: PendingVerify = { email, requestedAt: Date.now() }
  await chrome.storage.local.set({ [PENDING_KEY]: v })
}

export async function getPendingVerify(): Promise<PendingVerify | null> {
  const result = await chrome.storage.local.get(PENDING_KEY)
  const v = result[PENDING_KEY] as PendingVerify | undefined
  if (!v) return null
  if (Date.now() - v.requestedAt > PENDING_TTL_MS) {
    await chrome.storage.local.remove(PENDING_KEY)
    return null
  }
  return v
}

export async function clearPendingVerify(): Promise<void> {
  await chrome.storage.local.remove(PENDING_KEY)
}

export async function hasSeenOnboarding(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_KEY)
  return result[ONBOARDING_KEY] === true
}

export async function markOnboardingSeen(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_KEY]: true })
}

export async function resetOnboarding(): Promise<void> {
  await chrome.storage.local.remove(ONBOARDING_KEY)
}
