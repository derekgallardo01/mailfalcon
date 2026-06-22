import {
  clearPendingVerify,
  getPendingVerify,
  getSession,
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboarding,
  setPendingVerify,
} from '../../src/auth-store'
import { requestCode } from '../../src/api'
import { config } from '../../src/config'
import {
  cancel as cancelScheduled,
  listPending as listScheduled,
  type ScheduledSend,
} from '../../src/scheduled'
import { pendingSendCount, performSignOut } from '../../src/sign-out'
import { verifyCodeWithCleanup } from '../../src/verify-flow'

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
    const pending = await pendingSendCount()
    if (pending > 0) {
      const ok = confirm(
        `${pending} scheduled send${pending === 1 ? '' : 's'} will be cancelled when you sign out. Continue?`,
      )
      if (!ok) return
    }
    await performSignOut()
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

  void renderWorkspaceLine()
  void renderSpoofSection()
}

async function renderWorkspaceLine(): Promise<void> {
  const el = document.getElementById('workspace-line')
  if (!el) return
  try {
    const me = await fetchMe()
    if (!me) return
    if (me.workspaces.length <= 1) return
    const label =
      me.activeWorkspaceRole === 'owner'
        ? `Workspace: ${me.activeWorkspaceName} (owner)`
        : `Workspace: ${me.activeWorkspaceName}`
    el.textContent = label
    el.style.display = 'block'
  } catch {
    /* ignore */
  }
}

interface MeShape {
  activeWorkspaceName: string
  activeWorkspaceRole: 'owner' | 'member'
  workspaces: Array<{
    id: string
    name: string
    role: string
    isPersonal: boolean
    memberCount: number
  }>
}

async function fetchMe(): Promise<MeShape | null> {
  const session = await getSession()
  if (!session) return null
  const res = await fetch(`${config.apiHost}/v1/me`, {
    headers: { Authorization: `Bearer ${session.token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as MeShape
}

interface SpoofStatus {
  connected: boolean
  email: string | null
  enabled: boolean
}

async function renderSpoofSection(): Promise<void> {
  const statusEl = document.getElementById('spoof-status')
  const controls = document.getElementById('spoof-controls')
  if (!statusEl || !controls) return
  controls.replaceChildren()

  let s: SpoofStatus
  try {
    s = (await chrome.runtime.sendMessage({ type: 'spoof-status' })) as SpoofStatus
  } catch {
    statusEl.textContent = 'Background not ready.'
    return
  }

  if (!s.connected) {
    statusEl.textContent = 'Verify SPF / DKIM / DMARC on inbound mail by connecting your Gmail account (read-only headers).'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'Connect Gmail'
    btn.addEventListener('click', async () => {
      setMsg('spoof-msg', 'Opening Google consent…')
      try {
        const res = (await chrome.runtime.sendMessage({ type: 'spoof-connect' })) as {
          ok: boolean
          email?: string | null
          error?: string
        }
        if (!res.ok) throw new Error(res.error ?? 'connect_failed')
        setMsg('spoof-msg', 'Connected.', 'ok')
        await renderSpoofSection()
      } catch (err) {
        setMsg(
          'spoof-msg',
          err instanceof Error ? err.message : 'Connect failed',
          'err',
        )
      }
    })
    controls.appendChild(btn)
    return
  }

  statusEl.textContent = s.email
    ? `Connected as ${s.email}.`
    : 'Connected.'

  const toggleLabel = document.createElement('label')
  toggleLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:12px;'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.checked = s.enabled
  toggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'spoof-set-enabled',
      enabled: toggle.checked,
    })
    setMsg('spoof-msg', toggle.checked ? 'Verification on.' : 'Verification off.', 'ok')
  })
  toggleLabel.appendChild(toggle)
  toggleLabel.appendChild(document.createTextNode('Show verified chips'))
  controls.appendChild(toggleLabel)

  const disconnectBtn = document.createElement('button')
  disconnectBtn.type = 'button'
  disconnectBtn.className = 'link'
  disconnectBtn.textContent = 'Disconnect'
  disconnectBtn.addEventListener('click', async () => {
    setMsg('spoof-msg', 'Revoking…')
    await chrome.runtime.sendMessage({ type: 'spoof-disconnect' })
    setMsg('spoof-msg', 'Disconnected.', 'ok')
    await renderSpoofSection()
  })
  controls.appendChild(disconnectBtn)
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
      const result = await verifyCodeWithCleanup(email, code)
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
