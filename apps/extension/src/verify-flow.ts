import { verifyCode, type VerifyResponse } from './api'
import { getSession, setSession } from './auth-store'
import { clearLocalAccountState } from './sign-out'

/**
 * Wraps verifyCode + setSession with one bit of extra safety: if the
 * verified session is for a different email than the one currently
 * stored, flush the prior account's local caches first. Without this,
 * templates / tracked-threads / scheduled-sends from the prior account
 * leak into the new session.
 */
export async function verifyCodeWithCleanup(
  email: string,
  code: string,
): Promise<VerifyResponse> {
  const result = await verifyCode(email, code)

  const prior = await getSession()
  if (prior && prior.email.toLowerCase() !== result.email.toLowerCase()) {
    await clearLocalAccountState()
  }

  await setSession({
    token: result.token,
    email: result.email,
    userId: result.userId,
  })
  return result
}
