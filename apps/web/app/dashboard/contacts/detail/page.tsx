'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { type ContactDetail, getContact } from '../../../../lib/api'
import { AppHeader } from '../../../../lib/AppHeader'
import { Sparkline } from '../../../../lib/Sparkline'

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`
  return `${(ms / 86_400_000).toFixed(1)}d`
}

function locationOf(e: ContactDetail['events'][number]): string {
  const parts: string[] = []
  if (e.city) parts.push(e.city)
  if (e.regionCode) parts.push(e.regionCode)
  else if (e.country) parts.push(e.country)
  return parts.join(', ')
}

const EVENT_ICON: Record<ContactDetail['events'][number]['type'], string> = {
  open: '⇣',
  click: '→',
  reply: '↩',
}

/** Bin events into N daily buckets, newest on the right. */
function bin(events: ContactDetail['events'], days: number): {
  points: number[]
  startTs: number
} {
  const now = Date.now()
  const dayMs = 86_400_000
  const startOfTodayUtc = Math.floor(now / dayMs) * dayMs
  const startTs = startOfTodayUtc - (days - 1) * dayMs
  const points = new Array<number>(days).fill(0)
  for (const e of events) {
    if (e.type !== 'open' || e.uaClass === 'bot') continue
    const dayIdx = Math.floor((e.ts - startTs) / dayMs)
    if (dayIdx >= 0 && dayIdx < days) points[dayIdx]! += 1
  }
  return { points, startTs }
}

function classify(c: ContactDetail['contact']): 'hot' | 'warm' | 'cold' | 'dormant' {
  if (c.lastEventAt == null) {
    if (Date.now() - c.firstSeenAt > 60 * 86_400_000) return 'dormant'
    return 'cold'
  }
  const ago = Date.now() - c.lastEventAt
  if (ago < 7 * 86_400_000) return 'hot'
  if (ago < 30 * 86_400_000) return 'warm'
  return 'cold'
}

const HEAT_STYLE: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-amber-100 text-amber-700',
  cold: 'bg-slate-100 text-slate-600',
  dormant: 'bg-slate-100 text-slate-400',
}

function ContactDetailInner() {
  const searchParams = useSearchParams()
  const hashedAddr = searchParams.get('id') ?? ''
  const [data, setData] = useState<ContactDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hashedAddr) {
      setError('missing_id')
      setLoading(false)
      return
    }
    setLoading(true)
    getContact(hashedAddr)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'load_failed')
      })
      .finally(() => setLoading(false))
  }, [hashedAddr])

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <AppHeader />

      <main className="mt-6 space-y-6">
        <Link
          href="/dashboard/contacts"
          className="inline-flex items-center gap-1 text-sm text-falcon-500 hover:text-falcon-700"
        >
          ← All contacts
        </Link>

        {loading && <p className="text-sm text-falcon-500">Loading…</p>}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load contact: {error}
          </div>
        )}

        {data && (
          <>
            <ContactHeader data={data} />
            <ContactTrend events={data.events} />
            <ContactEmails emails={data.emails} />
            <ContactTimeline events={data.events} />
          </>
        )}
      </main>
    </div>
  )
}

function ContactHeader({ data }: { data: ContactDetail }) {
  const c = data.contact
  const heat = classify(c)
  const openRate = c.sends > 0 ? Math.round((100 * c.humanOpens) / c.sends) : 0
  const clickRate = c.sends > 0 ? Math.round((100 * c.clicks) / c.sends) : 0
  const replyRate = c.sends > 0 ? Math.round((100 * c.replies) / c.sends) : 0
  return (
    <div className="rounded-lg border border-falcon-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-falcon-700">
            {c.displayLabel || '(no label)'}
          </h1>
          <p className="mt-1 text-xs text-falcon-400">
            First emailed {formatRelative(c.firstSeenAt)}
            {c.lastEventAt && ` · Last engaged ${formatRelative(c.lastEventAt)}`}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${HEAT_STYLE[heat]}`}
        >
          {heat}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sent" value={c.sends} />
        <Stat label="Opens" value={`${c.humanOpens} (${openRate}%)`} />
        <Stat label="Clicks" value={`${c.clicks} (${clickRate}%)`} />
        <Stat label="Replies" value={`${c.replies} (${replyRate}%)`} />
      </div>
      {c.avgTimeToFirstOpenMs != null && (
        <p className="mt-3 text-xs text-falcon-500">
          Avg time to first open: <strong>{formatDuration(c.avgTimeToFirstOpenMs)}</strong>
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-falcon-700">
        {value}
      </p>
    </div>
  )
}

function ContactTrend({ events }: { events: ContactDetail['events'] }) {
  const { points, startTs } = bin(events, 60)
  return (
    <Sparkline
      points={points}
      label="Opens over the last 60 days"
      width={640}
      height={56}
      startTs={startTs}
    />
  )
}

function ContactEmails({ emails }: { emails: ContactDetail['emails'] }) {
  if (emails.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-falcon-500">
        Tracked emails ({emails.length})
      </h2>
      <div className="divide-y divide-falcon-200 overflow-hidden rounded-lg border border-falcon-200 bg-white">
        {emails.map((e) => (
          <Link
            key={e.id}
            href={`/dashboard/email?id=${encodeURIComponent(e.id)}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-falcon-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-falcon-700">
                {e.subject || '(no subject)'}
              </p>
              <p className="text-xs text-falcon-500 tabular-nums">
                {formatRelative(e.sentAt)} · {e.humanOpens} opens · {e.clicks} clicks
                {e.hasReply && ' · replied'}
              </p>
            </div>
            <span className="text-xs text-falcon-400">details ↗</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ContactTimeline({ events }: { events: ContactDetail['events'] }) {
  if (events.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-falcon-500">
        Recent events ({events.length})
      </h2>
      <div className="divide-y divide-falcon-200 overflow-hidden rounded-lg border border-falcon-200 bg-white">
        {events.map((e, i) => (
          <div
            key={i}
            className="flex items-baseline gap-3 px-4 py-2.5 text-sm"
          >
            <span className="w-4 text-base text-falcon-500">{EVENT_ICON[e.type]}</span>
            <span className="font-medium capitalize text-falcon-700">{e.type}</span>
            <Link
              href={`/dashboard/email?id=${encodeURIComponent(e.emailId)}`}
              className="min-w-0 flex-1 truncate text-falcon-500 hover:text-falcon-700"
            >
              {e.subject || '(no subject)'}
            </Link>
            <span className="hidden text-xs text-falcon-400 md:inline">
              {locationOf(e) || '—'}
            </span>
            <span className="text-xs text-falcon-400">{formatRelative(e.ts)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ContactDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-6">
          <p className="text-sm text-falcon-500">Loading…</p>
        </main>
      }
    >
      <ContactDetailInner />
    </Suspense>
  )
}
