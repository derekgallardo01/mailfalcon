const TOKEN_KEY = 'mf.token'
const EMAIL_KEY = 'mf.email'
const USER_ID_KEY = 'mf.userId'

export interface Session {
  token: string
  email: string
  userId: string
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  const token = window.localStorage.getItem(TOKEN_KEY)
  const email = window.localStorage.getItem(EMAIL_KEY)
  const userId = window.localStorage.getItem(USER_ID_KEY)
  if (!token || !email || !userId) return null
  return { token, email, userId }
}

export function setSession(s: Session): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, s.token)
  window.localStorage.setItem(EMAIL_KEY, s.email)
  window.localStorage.setItem(USER_ID_KEY, s.userId)
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(EMAIL_KEY)
  window.localStorage.removeItem(USER_ID_KEY)
}
