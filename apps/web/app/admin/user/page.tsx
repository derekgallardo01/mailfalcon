'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { admin, type AdminUserDetail, getMe } from '../../../lib/api'
import { clearSession, getSession } from '../../../lib/auth-store'
import {
  formatBrowser,
  formatDevice,
  formatET,
  formatETShort,
  formatLocation,
  formatOs,
  formatRelative,
} from '../../../lib/format'

function tierColor(tier: AdminUserDetail['user']['tier']): string {
  switch (tier) {
    case 'free':
      return 'bg-falcon-100 text-falcon-700'
    case 'pro':
      return 'bg-emerald-100 text-emerald-800'
    case 'team':
      return 'bg-blue-100 text-blue-800'
    case 'admin':
      return 'bg-amber-100 text-amber-800'
  }
}

function AdminUserInner() {
  const router = useRouter()
  const search = useSearchParams()
  const id = search.get('id')
  const [data, setData] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getSession()) {
      router.replace('/sign-in')
      return
    }
    if (!id) {
      router.replace('/admin')
      return
    }
    void (async () => {
      try {
        const me = await getMe()
        if (me.tier !== 'admin') {
          setError('forbidden')
          return
        }
        const detail = await admin.userDetail(id)
        setData(detail)
      } catch (err) {
        if (err instanceof Error && err.message === 'unauthorized') {
          clearSession()
          router.replace('/sign-in')
          return
        }
        setError(err instanceof Error ? err.message : 'failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, router])

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-red-700">{error ?? 'unknown'}</p>
        <Link href="/admin" className="mt-4 inline-block text-sm text-falcon-500 hover:text-falcon-700">
          ← Back to admin
        </Link>
      </main>
    )
  }

  const { user, totals, emails, events } = data

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="border-b border-falcon-200 pb-4">
        <Link href="/admin" className="text-xs text-falcon-500 hover:text-falcon-700">
          ← Admin
        </Link>
        <div className="mt-1 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-falcon-700">{user.email}</h1>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${tierColor(user.tier)}`}>
            {user.tier}
          </span>
        </div>
        <p className="mt-1 text-xs text-falcon-500" title={formatET(user.createdAt)}>
          Joined {formatRelative(user.createdAt)}
          {user.hasStripeCustomer && ' · Stripe customer'}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-4 gap-4">
        <StatCard label="Tracked emails" value={totals.emails} />
        <StatCard label="Opens" value={totals.opens} hint={`${totals.humanOpens} human`} />
        <StatCard label="Clicks" value={totals.clicks} />
        <StatCard
          label="Bot opens"
          value={totals.opens - totals.humanOpens}
          muted
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-falcon-500">
          Recent tracked emails ({emails.length})
        </h2>
        {emails.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No tracked emails.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Sent</th>
                  <th className="px-4 py-2 text-right font-medium">To</th>
                  <th className="px-4 py-2 text-right font-medium">Opens</th>
                  <th className="px-4 py-2 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2 text-right font-medium">Last event</th>
                  <th className="px-4 py-2 text-left font-medium">Privacy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-falcon-100">
                {emails.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-falcon-50"
                    onClick={() => router.push(`/dashboard/email?id=${encodeURIComponent(e.id)}`)}
                  >
                    <td className="px-4 py-3 text-falcon-700">{formatRelative(e.sentAt)}</td>
                    <td className="px-4 py-3 text-right text-falcon-700">{e.recipientCount}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={e.opens > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}>
                        {e.opens}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={e.clicks > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}>
                        {e.clicks}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-500">
                      {e.lastEventAt ? formatRelative(e.lastEventAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-falcon-500">
                      {e.privacyMode ? 'on' : 'off'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-falcon-500">
          Recent events ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No events yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">When (ET)</th>
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
      </section>
    </div>
  )
}

export default function AdminUserPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-falcon-500">Loading…</p>
        </main>
      }
    >
      <AdminUserInner />
    </Suspense>
  )
}

function StatCard({
  label,
  value,
  hint,
  muted,
}: {
  label: string
  value: number
  hint?: string
  muted?: boolean
}) {
  return (
    <div className={`rounded border border-falcon-200 p-4 ${muted ? 'opacity-60' : ''}`}>
      <p className="text-xs uppercase tracking-wide text-falcon-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-falcon-700">{value.toLocaleString()}</p>
      {hint && <p className="text-xs text-falcon-500">{hint}</p>}
    </div>
  )
}
