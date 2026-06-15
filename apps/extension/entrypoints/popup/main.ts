import {
  clearPendingVerify,
  clearSession,
  getPendingVerify,
  getSession,
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboarding,
  setPendingVerify,
  setSession,
} from '../../src/auth-store'
import { logout, requestCode, verifyCode } from '../../src/api'

const root = document.getElementById('root')!

function cloneTemplate(id: string): DocumentFragment {
  const tpl = document.getElementById(id) as HTMLTemplateElement | null
  if (!tpl) throw new Error(`template ${id} missing`)
  return tpl.content.cloneNode(true) as DocumentFragment
}

function bind(frag: DocumentFragment, values: Record<string, string>): void {
  for (const [k, v] of Object.entries(values)) {
    frag.querySelectorAll(`[data-bind="${k}"]`).forEach((el) => {
      el.textContent = v
    })
  }
}

function setMsg(id: string, text: string, kind: 'err' | 'ok' | 'neutral' = 'neutral'): void {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = text
  el.className = `msg ${kind === 'neutral' ? '' : kind}`
}

function render(node: DocumentFragment): void {
  root.replaceChildren(node)
}

async function showSignedIn(email: string): Promise<void> {
  const frag = cloneTemplate('tpl-signed-in')
  bind(frag, { email })
  render(frag)
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout()
    await clearSession()
    await clearPendingVerify()
    try {
      await chrome.runtime.sendMessage({ type: 'signed-out' })
    } catch {
      /* SW may be cold */
    }
    await showRequest()
  })
  document.getElementById('replay-onboarding')?.addEventListener('click', async () => {
    await resetOnboarding()
    await showOnboarding(email)
  })
}

async function showRequest(prefill = ''): Promise<void> {
  const frag = cloneTemplate('tpl-request')
  render(frag)
  const form = document.getElementById('request-form') as HTMLFormElement
  const emailInput = form.elements.namedItem('email') as HTMLInputElement
  if (prefill) emailInput.value = prefill
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = emailInput.value.trim().toLowerCase()
    setMsg('request-msg', 'Sending…')
    try {
      await requestCode(email)
      await setPendingVerify(email)
      await showVerify(email)
    } catch (err) {
      setMsg('request-msg', err instanceof Error ? err.message : 'Send failed', 'err')
    }
  })
}

async function showVerify(email: string): Promise<void> {
  const frag = cloneTemplate('tpl-verify')
  bind(frag, { email })
  render(frag)
  const form = document.getElementById('verify-form') as HTMLFormElement
  const codeInput = form.elements.namedItem('code') as HTMLInputElement
  setTimeout(() => codeInput.focus(), 0)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = codeInput.value.trim()
    setMsg('verify-msg', 'Verifying…')
    try {
      const result = await verifyCode(email, code)
      await setSession({ token: result.token, email: result.email, userId: result.userId })
      await clearPendingVerify()
      try {
        await chrome.runtime.sendMessage({ type: 'signed-in' })
      } catch {
        // background SW may be cold; it picks up on next start
      }
      // First sign-in on this device shows the 3-step intro. Returning
      // users skip it.
      if (await hasSeenOnboarding()) {
        await showSignedIn(result.email)
      } else {
        await showOnboarding(result.email)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verify failed'
      setMsg('verify-msg', humanizeError(msg), 'err')
    }
  })
  document.getElementById('verify-back')?.addEventListener('click', async () => {
    await clearPendingVerify()
    await showRequest(email)
  })
}

async function showOnboarding(email: string): Promise<void> {
  const frag = cloneTemplate('tpl-onboarding')
  render(frag)
  document.getElementById('onboarding-done')?.addEventListener('click', async () => {
    await markOnboardingSeen()
    await showSignedIn(email)
  })
}

function humanizeError(code: string): string {
  switch (code) {
    case 'wrong_code':
      return 'Wrong code. Try again.'
    case 'too_many_attempts':
      return 'Too many attempts. Request a new code.'
    case 'expired_or_unknown':
      return 'Code expired. Request a new one.'
    default:
      return code
  }
}

async function init(): Promise<void> {
  const session = await getSession()
  if (session) {
    await showSignedIn(session.email)
    return
  }
  // Closing the popup tab to copy a code from inbox shouldn't reset
  // progress — restore the verify stage if a fresh request is in flight.
  const pending = await getPendingVerify()
  if (pending) {
    await showVerify(pending.email)
    return
  }
  await showRequest()
}

void init()
