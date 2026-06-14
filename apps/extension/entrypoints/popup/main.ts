import { clearSession, getSession, setSession } from '../../src/auth-store'
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
    try {
      await chrome.runtime.sendMessage({ type: 'signed-out' })
    } catch {
      /* SW may be cold */
    }
    await showRequest()
  })
}

async function showRequest(): Promise<void> {
  const frag = cloneTemplate('tpl-request')
  render(frag)
  const form = document.getElementById('request-form') as HTMLFormElement
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase()
    setMsg('request-msg', 'Sending…')
    try {
      await requestCode(email)
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = (form.elements.namedItem('code') as HTMLInputElement).value.trim()
    setMsg('verify-msg', 'Verifying…')
    try {
      const result = await verifyCode(email, code)
      await setSession({ token: result.token, email: result.email, userId: result.userId })
      try {
        await chrome.runtime.sendMessage({ type: 'signed-in' })
      } catch {
        // background SW may be cold; it picks up on next start
      }
      await showSignedIn(result.email)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verify failed'
      setMsg('verify-msg', humanizeError(msg), 'err')
    }
  })
  document.getElementById('verify-back')?.addEventListener('click', () => {
    void showRequest()
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
  } else {
    await showRequest()
  }
}

void init()
