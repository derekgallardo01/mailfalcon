'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  type ScheduledSend,
  cancelScheduledSend,
  listScheduledSends,
} from '../../../lib/api'
import { AppHeader } from '../../../lib/AppHeader'

type StatusBucket = 'upcoming' | 'history'

const STATUS_LABEL: Record<ScheduledSend['status'], string> = {
  queued: 'Queued',
  snoozed: 'Snoozed',
  fired: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<ScheduledSend['status'], string> = {
  queued: 'bg-blue-100 text-blue-700',
  snoozed: 'bg-amber-100 text-amber-700',
  fired: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

function bucketFor(s: ScheduledSend['status']): StatusBucket {
  return s === 'queued' || s === 'snoozed' ? 'upcoming' : 'history'
}

function formatRelative(ts: number): string {
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const future = diff > 0
  const minutes = Math.round(abs / 60_000)
  if (minutes < 1) return future ? 'in <1m' : 'just now'
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`
  const days = Math.round(hours / 24)
  return future ? `in ${days}d` : `${days}d ago`
}

function formatAbs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function trimList(list: string[], max = 2): string {
  if (list.length === 0) return '—'
  if (list.length <= max) return list.join(', ')
  return `${list.slice(0, max).join(', ')} +${list.length - max}`
}

export default function ScheduledPage() {
  const [rows, setRows] = useState<ScheduledSend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setRows(await listScheduledSends())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCancel(id: string) {
    if (
      !window.confirm(
        'Cancel this scheduled send?\n\nThis marks it cancelled in the dashboard, but you must also cancel it from the extension popup on the device that scheduled it — the alarm will otherwise still try to fire.',
      )
    ) {
      return
    }
    setBusyId(id)
    try {
      await cancelScheduledSend(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel_failed')
    } finally {
      setBusyId(null)
    }
  }

  const upcoming = rows.filter((r) => bucketFor(r.status) === 'upcoming')
  const history = rows.filter((r) => bucketFor(r.status) === 'history')
  upcoming.sort((a, b) => a.scheduledAt - b.scheduledAt)
  history.sort((a, b) => b.scheduledAt - a.scheduledAt)

  return (
    <div className="min-h-screen bg-falcon-50">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-falcon-700">Scheduled sends</h1>
          <p className="mt-1 text-sm text-falcon-500">
            Upcoming + recent history for any tracked email queued via the extension's
            scheduled-send picker. Dispatch still requires a live Gmail tab on the
            device that scheduled it.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-falcon-500">
            Upcoming ({upcoming.length})
          </h2>
          <Table
            rows={upcoming}
            loading={loading}
            empty="Nothing queued. Schedule a send from the Gmail compose status bar."
            busyId={busyId}
            onCancel={onCancel}
          />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-falcon-500">
            Recent history ({history.length})
          </h2>
          <Table
            rows={history}
            loading={loading}
            empty="No past scheduled sends yet."
            busyId={busyId}
            onCancel={onCancel}
          />
        </section>
      </main>
    </div>
  )
}

function Table({
  rows,
  loading,
  empty,
  busyId,
  onCancel,
}: {
  rows: ScheduledSend[]
  loading: boolean
  empty: string
  busyId: string | null
  onCancel: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-falcon-200 bg-white p-6 text-center text-sm text-falcon-500">
        Loading…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-falcon-200 bg-white p-6 text-center text-sm text-falcon-500">
        {empty}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-falcon-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-falcon-50 text-[10px] uppercase tracking-wider text-falcon-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">To</th>
            <th className="px-3 py-2 text-left font-medium">When</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-falcon-100">
              <td className="px-3 py-3 align-top">
                <p className="font-medium text-falcon-700">
                  {r.subject || '(no subject)'}
                </p>
                {r.bodyPreview && (
                  <p className="mt-1 line-clamp-1 text-[11px] text-falcon-500">
                    {r.bodyPreview}
                  </p>
                )}
              </td>
              <td className="px-3 py-3 align-top text-falcon-700">
                {trimList(r.to)}
                {r.cc.length > 0 && (
                  <p className="text-[10px] text-falcon-500">cc: {trimList(r.cc)}</p>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <p className="text-falcon-700">{formatRelative(r.scheduledAt)}</p>
                <p className="text-[10px] text-falcon-500">{formatAbs(r.scheduledAt)}</p>
              </td>
              <td className="px-3 py-3 align-top">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}
                  title={r.failureReason ?? undefined}
                >
                  {STATUS_LABEL[r.status]}
                </span>
                {r.failureReason && (
                  <p className="mt-1 text-[10px] text-red-600">{r.failureReason}</p>
                )}
              </td>
              <td className="px-3 py-3 text-right align-top">
                {r.status === 'fired' && r.firedEmailId && (
                  <Link
                    href={`/dashboard/email/?id=${encodeURIComponent(r.firedEmailId)}`}
                    className="text-[12px] font-medium text-falcon-600 hover:underline"
                  >
                    View
                  </Link>
                )}
                {(r.status === 'queued' || r.status === 'snoozed') && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onCancel(r.id)}
                    className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {busyId === r.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
