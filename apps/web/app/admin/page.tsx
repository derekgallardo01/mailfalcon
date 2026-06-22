'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AppHeader } from '../../lib/AppHeader'
import {
  admin,
  type AdminEmail,
  type AdminEvent,
  type AdminStats,
  type AdminUser,
  type EmailSort,
  getMe,
} from '../../lib/api'
import { clearSession, getSession } from '../../lib/auth-store'
import {
  formatBrowser,
  formatDevice,
  formatET,
  formatETShort,
  formatLocalShort,
  formatLocation,
  formatOs,
  formatRelative,
} from '../../lib/format'

type Tab = 'stats' | 'users' | 'emails' | 'events'
type DatePreset = 'today' | '7d' | '30d' | 'all'

function presetToFrom(preset: DatePreset): number | undefined {
  if (preset === 'all') return undefined
  if (preset === 'today') {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (preset === '7d') return Date.now() - 7 * 86_400_000
  if (preset === '30d') return Date.now() - 30 * 86_400_000
  return undefined
}

const ADMIN_DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

const ADMIN_SORT_OPTIONS: { key: EmailSort; label: string }[] = [
  { key: 'sentAt-desc', label: 'Newest first' },
  { key: 'sentAt-asc', label: 'Oldest first' },
  { key: 'opens-desc', label: 'Most opens' },
  { key: 'clicks-desc', label: 'Most clicks' },
]

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('stats')
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userStatusFilter, setUserStatusFilter] = useState<
    'all' | 'installed' | 'activated' | 'active' | 'dormant'
  >('all')
  const [emails, setEmails] = useState<AdminEmail[]>([])
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  // Filters for the emails tab (admin-local state, not URL-synced).
  const [emailQ, setEmailQ] = useState('')
  const [emailQInput, setEmailQInput] = useState('')
  const [emailSort, setEmailSort] = useState<EmailSort>('sentAt-desc')
  const [emailDate, setEmailDate] = useState<DatePreset>('all')

  // Debounce search box → query state.
  useEffect(() => {
    if (emailQInput === emailQ) return
    const t = setTimeout(() => setEmailQ(emailQInput.trim()), 300)
    return () => clearTimeout(t)
  }, [emailQInput, emailQ])

  // Refetch when emails-tab filters change.
  useEffect(() => {
    if (forbidden || loading) return
    admin
      .emails({
        q: emailQ || undefined,
        sort: emailSort,
        from: presetToFrom(emailDate),
      })
      .then((res) => setEmails(res.emails))
      .catch((err) => {
        if (err instanceof Error && err.message !== 'forbidden') {
          setError(err.message)
        }
      })
  }, [emailQ, emailSort, emailDate, forbidden, loading])

  // Refetch users when status filter changes.
  useEffect(() => {
    if (forbidden || loading) return
    admin
      .users(userStatusFilter === 'all' ? undefined : userStatusFilter)
      .then((res) => setUsers(res.users))
      .catch((err) => {
        if (err instanceof Error && err.message !== 'forbidden') {
          setError(err.message)
        }
      })
  }, [userStatusFilter, forbidden, loading])

  useEffect(() => {
    if (!getSession()) {
      router.replace('/sign-in')
      return
    }
    void (async () => {
      try {
        const me = await getMe()
        if (me.tier !== 'admin') {
          setForbidden(true)
          setLoading(false)
          return
        }
        const [s, u, em, ev] = await Promise.all([
          admin.stats(),
          admin.users(),
          admin.emails(),
          admin.events(),
        ])
        setStats(s)
        setUsers(u.users)
        setEmails(em.emails)
        setEvents(ev.events)
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'unauthorized') {
            clearSession()
            router.replace('/sign-in')
            return
          }
          if (err.message === 'forbidden') {
            setForbidden(true)
          } else {
            setError(err.message)
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const hasEmailFilters =
    emailQ || emailSort !== 'sentAt-desc' || emailDate !== 'all'

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-6">
        <AppHeader />
        <p className="mt-6 text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-6">
        <AppHeader />
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="text-base font-semibold text-falcon-700">Admin</h1>
          <p className="mt-1 text-sm text-red-700">
            Your account does not have admin access.
          </p>
        </div>
      </main>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <AppHeader />

      <div className="mt-6">
        <h1 className="text-xl font-semibold text-falcon-700">Admin</h1>
        <p className="text-xs text-falcon-500">All users, all activity</p>
      </div>

      <nav className="mt-4 flex gap-1 border-b border-falcon-200">
        {(['stats', 'users', 'emails', 'events'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? 'border-b-2 border-falcon-500 text-falcon-700'
                : 'text-falcon-500 hover:text-falcon-700'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {tab === 'stats' && stats && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label="Total users" value={stats.totals.users} />
            <StatCard label="Tracked emails" value={stats.totals.emails} />
            <StatCard label="Events logged" value={stats.totals.events} />
            <StatCard label="New users today" value={stats.today.newUsers} />
            <StatCard label="Emails sent today" value={stats.today.emailsSent} />
            <StatCard label="Events today" value={stats.today.eventsLogged} />
            <StatCard
              label="Installed, never sent"
              value={stats.telemetry.installedNeverSent}
            />
            <StatCard label="Activated" value={stats.telemetry.activated} />
            <StatCard label="Active in 7d" value={stats.telemetry.active7d} />
            <div className="col-span-2 rounded-lg border border-falcon-200 bg-white p-4 md:col-span-3">
              <p className="text-xs uppercase tracking-wide text-falcon-500">
                Users by tier
              </p>
              <div className="mt-2 flex gap-6 text-sm">
                {Object.entries(stats.usersByTier).map(([tier, count]) => (
                  <div key={tier}>
                    <span className="font-medium text-falcon-700">{count}</span>
                    <span className="ml-1 text-falcon-500">{tier}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-falcon-500">
                Filter
              </label>
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value as typeof userStatusFilter)}
                className="rounded border border-falcon-200 bg-white px-3 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
              >
                <option value="all">All ({users.length})</option>
                <option value="installed">Installed, never sent</option>
                <option value="activated">Activated</option>
                <option value="active">Active (30d)</option>
                <option value="dormant">Dormant</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-lg border border-falcon-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Tier</th>
                    <th className="px-4 py-2 text-right font-medium">Emails</th>
                    <th className="px-4 py-2 text-right font-medium">Tpl/WS</th>
                    <th className="px-4 py-2 text-right font-medium">Version</th>
                    <th className="px-4 py-2 text-right font-medium">Last seen</th>
                    <th className="px-4 py-2 text-right font-medium">First send</th>
                    <th className="px-4 py-2 text-right font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-falcon-100">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="cursor-pointer hover:bg-falcon-50"
                      onClick={() => router.push(`/admin/user?id=${encodeURIComponent(u.id)}`)}
                    >
                      <td className="px-4 py-3 text-falcon-700">{u.email}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={u.tier} />
                      </td>
                      <td className="px-4 py-3 text-right text-falcon-700">
                        {u.emailCount}
                      </td>
                      <td className="px-4 py-3 text-right text-falcon-500 tabular-nums">
                        {u.templateCount}/{u.workspaceCount}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-falcon-500 tabular-nums">
                        {u.extensionVersion ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-falcon-500 tabular-nums">
                        {u.lastSeenAt ? (
                          <div className="text-[11px] text-falcon-500">
                            {formatRelative(u.lastSeenAt)}
                          </div>
                        ) : (
                          <span className="text-falcon-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-falcon-500 tabular-nums">
                        {u.firstSendAt ? (
                          <div className="text-[11px] text-falcon-500">
                            {formatRelative(u.firstSendAt)}
                          </div>
                        ) : (
                          <span className="text-falcon-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-falcon-500 tabular-nums">
                        <div className="text-[11px] text-falcon-500">
                          {formatRelative(u.createdAt)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'emails' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={emailQInput}
                onChange={(e) => setEmailQInput(e.target.value)}
                placeholder="Search subjects or sender email…"
                className="min-w-[240px] flex-1 rounded border border-falcon-200 bg-white px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
              />
              <select
                value={emailSort}
                onChange={(e) => setEmailSort(e.target.value as EmailSort)}
                className="rounded border border-falcon-200 bg-white px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
              >
                {ADMIN_SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="inline-flex overflow-hidden rounded border border-falcon-200 bg-white text-xs">
                {ADMIN_DATE_PRESETS.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setEmailDate(p.key)}
                    className={`px-3 py-2 ${i > 0 ? 'border-l border-falcon-200' : ''} ${
                      emailDate === p.key
                        ? 'bg-falcon-100 font-medium text-falcon-700'
                        : 'text-falcon-500 hover:bg-falcon-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {hasEmailFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setEmailQInput('')
                    setEmailQ('')
                    setEmailSort('sentAt-desc')
                    setEmailDate('all')
                  }}
                  className="text-xs text-falcon-500 hover:text-falcon-700"
                >
                  Clear
                </button>
              )}
            </div>

            {emails.length === 0 ? (
              <div className="rounded border border-dashed border-falcon-200 bg-white p-8 text-center text-sm text-falcon-500">
                {hasEmailFilters
                  ? 'No emails match these filters.'
                  : 'No emails yet.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-falcon-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Sender</th>
                      <th className="px-4 py-2 text-left font-medium">Subject</th>
                      <th className="px-4 py-2 text-right font-medium">To</th>
                      <th className="px-4 py-2 text-right font-medium">Opens</th>
                      <th className="px-4 py-2 text-right font-medium">Clicks</th>
                      <th className="px-4 py-2 text-right font-medium">Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-falcon-100">
                    {emails.map((e) => (
                      <tr
                        key={e.id}
                        className="cursor-pointer hover:bg-falcon-50"
                        onClick={() => router.push(`/dashboard/email?id=${encodeURIComponent(e.id)}`)}
                      >
                        <td className="px-4 py-3 text-falcon-700">{e.userEmail}</td>
                        <td className="max-w-md truncate px-4 py-3 text-falcon-700">
                          {e.subject || <span className="italic text-falcon-400">(no subject)</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-falcon-700">
                          {e.recipientCount}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          title={
                            e.opens - e.humanOpens > 0
                              ? `${e.humanOpens} human, ${e.opens - e.humanOpens} bot (Gmail prefetch)`
                              : undefined
                          }
                        >
                          <span
                            className={e.humanOpens > 0 ? 'font-semibold text-emerald-700' : 'text-falcon-300'}
                          >
                            {e.humanOpens}
                          </span>
                          {e.opens - e.humanOpens > 0 && (
                            <span className="ml-1 text-[10px] text-falcon-300">
                              +{e.opens - e.humanOpens} bot
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={e.clicks > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}
                          >
                            {e.clicks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-falcon-500 tabular-nums">
                          <div className="text-falcon-700">{formatLocalShort(e.sentAt)}</div>
                          <div className="text-[11px] text-falcon-400">{formatRelative(e.sentAt)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'events' && (
          <div className="overflow-x-auto rounded-lg border border-falcon-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">When (ET)</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">User</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Type</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Browser</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">OS</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Device</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Location</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">IP /24</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Full IP</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">TZ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-falcon-100">
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-falcon-50"
                    onClick={() => router.push(`/dashboard/email?id=${encodeURIComponent(e.emailId)}`)}
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-700" title={formatET(e.ts)}>
                      <div>{formatETShort(e.ts)}</div>
                      <div className="text-xs text-falcon-400">{formatRelative(e.ts)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-700">{e.userEmail}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span
                        className={
                          e.type === 'open'
                            ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                            : 'rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800'
                        }
                      >
                        {e.type}
                        {e.type === 'open' && e.isFirstOpen ? ' · first' : ''}
                        {e.type === 'click' && e.linkId
                          ? ` · #${e.linkId.split(':')[1]}`
                          : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-500">
                      {formatBrowser(e)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-500">
                      {formatOs(e)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-500">
                      {formatDevice(e)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-falcon-500">
                      {formatLocation(e)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-falcon-500">
                      {e.ipPrefix ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-falcon-500">
                      {e.ipFull ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-falcon-400">
                      {e.timezone ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-falcon-400">
                      {e.emailId.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-falcon-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-falcon-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-falcon-700">
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function TierBadge({ tier }: { tier: AdminUser['tier'] }) {
  const colors: Record<AdminUser['tier'], string> = {
    free: 'bg-falcon-100 text-falcon-700',
    pro: 'bg-emerald-100 text-emerald-800',
    team: 'bg-blue-100 text-blue-800',
    admin: 'bg-amber-100 text-amber-800',
  }
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${colors[tier]}`}
    >
      {tier}
    </span>
  )
}

function StatusBadge({ status }: { status: AdminUser['status'] }) {
  const meta: Record<AdminUser['status'], { label: string; cls: string }> = {
    never_installed: { label: 'no install', cls: 'bg-slate-100 text-slate-600' },
    installed: { label: 'installed', cls: 'bg-amber-100 text-amber-800' },
    activated: { label: 'activated', cls: 'bg-blue-100 text-blue-800' },
    active: { label: 'active', cls: 'bg-emerald-100 text-emerald-800' },
    dormant: { label: 'dormant', cls: 'bg-rose-100 text-rose-800' },
  }
  const m = meta[status]
  return <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>{m.label}</span>
}
