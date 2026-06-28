'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type MeResponse,
  getMe,
  logout as apiLogout,
  openBillingPortal,
  startCheckout,
  switchWorkspace,
} from './api'
import { clearSession, getSession, type Session } from './auth-store'

interface Props {
  /** Live-event count shown as a small pulse chip next to the wordmark.
   *  Only the dashboard currently fires this. */
  liveCount?: number
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export function AppHeader({ liveCount = 0 }: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? '/dashboard'
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) {
      router.replace('/sign-in')
      return
    }
    setSession(s)
    void getMe()
      .then(setMe)
      .catch(() => undefined)
  }, [router])

  async function handleLogout() {
    await apiLogout()
    clearSession()
    router.replace('/sign-in')
  }

  const [showTierPicker, setShowTierPicker] = useState(false)

  async function handleUpgrade(tier: 'pro' | 'team') {
    setShowTierPicker(false)
    try {
      const url = await startCheckout(tier)
      window.location.assign(url)
    } catch {
      /* surfaced elsewhere; header swallows */
    }
  }

  async function handleManageBilling() {
    try {
      const url = await openBillingPortal()
      window.location.assign(url)
    } catch {
      /* same */
    }
  }

  if (!session) return null

  const isAdmin = me?.tier === 'admin'
  const isFree = me?.tier === 'free'
  const tierLabel = me?.tier
  const tierClass =
    tierLabel === 'admin'
      ? 'bg-amber-100 text-amber-800'
      : tierLabel === 'pro' || tierLabel === 'team'
      ? 'bg-emerald-100 text-emerald-800'
      : null

  const navLink = (href: string, label: string) => {
    // Dashboard root highlights for /dashboard + /dashboard/email but
    // NOT /dashboard/contacts — contacts has its own entry, and we don't
    // want both highlighted at once.
    const isDashboardRoot = href === '/dashboard'
    const active = isDashboardRoot
      ? pathname === href || pathname.startsWith('/dashboard/email')
      : pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        href={href}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          active
            ? 'bg-falcon-100 text-falcon-700'
            : 'text-falcon-500 hover:bg-falcon-50 hover:text-falcon-700'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="flex flex-col gap-3 border-b border-falcon-200 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/falcon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded"
            aria-hidden="true"
          />
          <span className="text-lg font-semibold text-falcon-700">
            MailFalcon
          </span>
        </Link>
        {tierLabel && tierClass && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierClass}`}
          >
            {tierLabel}
          </span>
        )}
        {me?.trialActive && me.trialDaysRemaining > 0 && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
            title={`Pro trial — ${me.trialDaysRemaining} day${me.trialDaysRemaining === 1 ? '' : 's'} left`}
          >
            Trial · {me.trialDaysRemaining}d
          </span>
        )}
        {me && me.workspaces.length > 0 && (
          <WorkspaceSwitcher me={me} />
        )}
        {liveCount > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            live · {liveCount} new
          </span>
        )}
        {me?.quietStartMinute != null && me?.quietEndMinute != null && (
          <Link
            href="/settings"
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
            title="Push notifications are muted during your quiet hours window. Click to manage."
          >
            🌙 Quiet {minutesToHHMM(me.quietStartMinute)}–{minutesToHHMM(me.quietEndMinute)}
          </Link>
        )}
      </div>

      <nav className="flex flex-wrap items-center gap-1">
        {navLink('/dashboard', 'Dashboard')}
        {navLink('/dashboard/scheduled', 'Scheduled')}
        {navLink('/dashboard/contacts', 'Contacts')}
        {navLink('/templates', 'Templates')}
        {navLink('/settings', 'Settings')}
        {isAdmin && navLink('/admin', 'Admin')}
      </nav>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isFree && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTierPicker((v) => !v)}
              className="rounded bg-falcon-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-falcon-600"
            >
              Upgrade ▾
            </button>
            {showTierPicker && (
              <div
                className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-falcon-200 bg-white p-3 shadow-lg"
                onMouseLeave={() => setShowTierPicker(false)}
              >
                <button
                  type="button"
                  onClick={() => handleUpgrade('pro')}
                  className="w-full rounded-md border border-falcon-200 px-3 py-2 text-left hover:bg-falcon-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-falcon-700">Pro</span>
                    <span className="text-xs font-medium text-falcon-500">$10/mo</span>
                  </div>
                  <p className="mt-1 text-[11px] text-falcon-500">
                    Unlimited tracking, digest, scheduled sends, mail-merge.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpgrade('team')}
                  className="mt-2 w-full rounded-md border border-falcon-200 px-3 py-2 text-left hover:bg-falcon-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-falcon-700">Team</span>
                    <span className="text-xs font-medium text-falcon-500">$25/mo</span>
                  </div>
                  <p className="mt-1 text-[11px] text-falcon-500">
                    Everything in Pro plus shared workspace, team analytics, inherited tier for members.
                  </p>
                </button>
              </div>
            )}
          </div>
        )}
        {me && !isFree && !isAdmin && me.hasStripeCustomer && (
          <button
            type="button"
            onClick={handleManageBilling}
            className="text-xs text-falcon-500 hover:text-falcon-700"
          >
            Manage billing
          </button>
        )}
        <span className="hidden text-xs text-falcon-400 md:inline">
          {session.email}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-falcon-500 hover:text-falcon-700"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

function WorkspaceSwitcher({ me }: { me: MeResponse }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function pick(id: string) {
    if (id === me.activeWorkspaceId) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      await switchWorkspace(id)
      router.refresh()
      // Force a reload so /v1/me + every cached query re-runs with the
      // new active workspace context.
      window.location.reload()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-falcon-200 bg-white px-2 py-1 text-xs font-medium text-falcon-700 hover:bg-falcon-50"
        title="Active workspace"
      >
        <span className="truncate max-w-[140px]">{me.activeWorkspaceName}</span>
        <span className="text-falcon-400">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-falcon-200 bg-white py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {me.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={busy}
              onClick={() => pick(w.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-falcon-50 ${
                w.id === me.activeWorkspaceId ? 'font-semibold text-falcon-700' : 'text-falcon-600'
              }`}
            >
              <span className="truncate">{w.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-falcon-400">
                {w.isPersonal ? 'personal' : w.role}
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-falcon-100" />
          <Link
            href="/workspaces"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs text-falcon-600 hover:bg-falcon-50"
          >
            Manage workspaces
          </Link>
        </div>
      )}
    </div>
  )
}
