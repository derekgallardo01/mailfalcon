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
import {
  cancel as cancelScheduled,
  listPending as listScheduled,
  type ScheduledSend,
} from '../../src/scheduled'

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

function formatCountdown(scheduledAt: number): string {
  const ms = scheduledAt - Date.now()
  if (ms <= 0) return 'firing now'
  if (ms < 60_000) return 'in <1m'
  if (ms < 3_600_000) return `in ${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `in ${Math.round(ms / 3_600_000)}h`
  return `in ${Math.round(ms / 86_400_000)}d`
}

function renderScheduledQueue(
  container: HTMLElement,
  records: ScheduledSend[],
  reload: () => Promise<void>,
): void {
  container.replaceChildren()
  if (records.length === 0) return
  const h = document.createElement('p')
  h.className = 'muted'
  h.style.marginTop = '12px'
  h.textContent = `Scheduled sends (${records.length})`
  container.appendChild(h)

  for (const r of records) {
    const row = document.createElement('div')
    row.className = 'row'
    row.style.cssText =
      'align-items:flex-start;gap:6px;padding:4px 0;border-top:1px solid #e3e9f2;'

    const left = document.createElement('div')
    left.style.cssText = 'flex:1;min-width:0;'
    const subj = document.createElement('div')
    subj.style.cssText =
      'font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    subj.textContent = r.subject || '(no subject)'
    const meta = document.createElement('div')
    meta.style.cssText = 'font-size:11px;color:#6886b1;'
    meta.textContent = `${formatCountdown(r.scheduledAt)} · to ${r.to[0] ?? '?'}${r.to.length > 1 ? ` +${r.to.length - 1}` : ''}`
    left.appendChild(subj)
    left.appendChild(meta)

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'link'
    cancelBtn.textContent = 'cancel'
    cancelBtn.addEventListener('click', async () => {
      await cancelScheduled(r.id)
      await reload()
    })

    row.appendChild(left)
    row.appendChild(cancelBtn)
    container.appendChild(row)
  }
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

  const queueEl = document.getElementById('scheduled-queue')
  if (queueEl) {
    const reload = async (): Promise<void> => {
      const records = await listScheduled()
      renderScheduledQueue(queueEl, records, reload)
    }
    void reload()
  }
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
