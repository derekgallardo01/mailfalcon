const TOKEN_KEY = 'mf.token'
const EMAIL_KEY = 'mf.email'
const USER_ID_KEY = 'mf.userId'

export interface Session {
  token: string
  email: string
  userId: string
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
