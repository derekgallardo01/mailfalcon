'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  admin,
  type AdminEmail,
  type AdminEvent,
  type AdminStats,
  type AdminUser,
  getMe,
} from '../../lib/api'
import { clearSession, getSession } from '../../lib/auth-store'

type Tab = 'stats' | 'users' | 'emails' | 'events'

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('stats')
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [emails, setEmails] = useState<AdminEmail[]>([])
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [error, setError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold text-falcon-700">Admin</h1>
        <p className="mt-2 text-sm text-red-700">
          Your account does not have admin access.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm text-falcon-500 hover:text-falcon-700"
        >
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-falcon-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-falcon-700">MailFalcon · admin</h1>
          <p className="text-xs text-falcon-500">All users, all activity</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-falcon-500 hover:text-falcon-700"
        >
          My dashboard →
        </Link>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-falcon-200">
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
            <div className="col-span-2 rounded border border-falcon-200 p-4 md:col-span-3">
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
          <div className="overflow-hidden rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Tier</th>
                  <th className="px-4 py-2 text-right font-medium">Emails</th>
                  <th className="px-4 py-2 text-right font-medium">Last email</th>
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
                      <TierBadge tier={u.tier} />
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-700">
                      {u.emailCount}
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-500">
                      {u.lastEmailAt ? formatRelative(u.lastEmailAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-500">
                      {formatRelative(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'emails' && (
          <div className="overflow-hidden rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Sender</th>
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
                    <td className="px-4 py-3 text-right text-falcon-700">
                      {e.recipientCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={e.opens > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}
                      >
                        {e.opens}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={e.clicks > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}
                      >
                        {e.clicks}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-500">
                      {formatRelative(e.sentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'events' && (
          <div className="overflow-hidden rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Time</th>
                  <th className="px-4 py-2 text-left font-medium">User</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">UA</th>
                  <th className="px-4 py-2 text-left font-medium">IP /24</th>
                  <th className="px-4 py-2 text-left font-medium">Country</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-falcon-100">
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-falcon-50"
                    onClick={() => router.push(`/dashboard/email?id=${encodeURIComponent(e.emailId)}`)}
                  >
                    <td className="px-4 py-3 text-falcon-500" title={formatDate(e.ts)}>
                      {formatRelative(e.ts)}
                    </td>
                    <td className="px-4 py-3 text-falcon-700">{e.userEmail}</td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-falcon-500">{e.uaClass}</td>
                    <td className="px-4 py-3 font-mono text-xs text-falcon-500">
                      {e.ipPrefix ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-falcon-500">{e.country ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-falcon-400">
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
    <div className="rounded border border-falcon-200 p-4">
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
