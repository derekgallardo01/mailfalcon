'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { type EmailDetail, getEmailDetail } from '../../../lib/api'
import { clearSession, getSession } from '../../../lib/auth-store'
import { config } from '../../../lib/config'

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

function EmailDetailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [data, setData] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveCount, setLiveCount] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) {
      router.replace('/sign-in')
      return
    }
    if (!id) {
      router.replace('/dashboard')
      return
    }

    const emailId = id

    function refresh() {
      return getEmailDetail(emailId)
        .then(setData)
        .catch((err) => {
          if (err instanceof Error) {
            if (err.message === 'unauthorized') {
              clearSession()
              router.replace('/sign-in')
              return
            }
            setError(err.message === 'not_found' ? 'Email not found' : err.message)
          }
        })
    }

    refresh().finally(() => setLoading(false))

    const url = new URL(`${config.apiHost}/stream`)
    url.searchParams.set('token', s.token)
    const es = new EventSource(url.toString())
    esRef.current = es
    es.addEventListener('event', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { emailId: string }
        if (payload.emailId === emailId) {
          setLiveCount((c) => c + 1)
          void refresh()
        }
      } catch {
        /* ignore */
      }
    })

    return () => {
      es.close()
      esRef.current = null
    }
  }, [id, router])

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-red-700">{error ?? 'Unknown error'}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-falcon-500 hover:text-falcon-700">
          ← Back to emails
        </Link>
      </main>
    )
  }

  const clicksByLink = new Map<string, number>()
  for (const ev of data.events) {
    if (ev.type === 'click' && ev.linkId) {
      clicksByLink.set(ev.linkId, (clicksByLink.get(ev.linkId) ?? 0) + 1)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-falcon-200 pb-4">
        <div>
          <Link href="/dashboard" className="text-xs text-falcon-500 hover:text-falcon-700">
            ← All emails
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-falcon-700">
            Email {data.email.id.slice(0, 8)}…
          </h1>
          <p className="text-xs text-falcon-500" title={formatDate(data.email.sentAt)}>
            Sent {formatRelative(data.email.sentAt)} · {data.email.recipientCount} recipient{data.email.recipientCount === 1 ? '' : 's'}
            {data.email.privacyMode && ' · privacy mode'}
          </p>
        </div>
        {liveCount > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            live · {liveCount} new
          </span>
        )}
      </header>

      <section className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Opens" value={data.counts.opens} hint={`${data.counts.humanOpens} human`} />
        <StatCard label="Clicks" value={data.counts.clicks} />
        <StatCard label="Bot opens" value={data.counts.opens - data.counts.humanOpens} muted />
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-falcon-500">Links</h2>
        {data.links.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No tracked links.</p>
        ) : (
          <ul className="mt-3 divide-y divide-falcon-100 rounded border border-falcon-200">
            {data.links.map((l) => {
              const linkId = `${data.email.id}:${l.idx}`
              const clicks = clicksByLink.get(linkId) ?? 0
              return (
                <li key={l.idx} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-falcon-700" title={l.originalUrl}>
                      {l.originalUrl}
                    </p>
                  </div>
                  <span className={clicks > 0 ? 'text-sm font-medium text-falcon-700' : 'text-sm text-falcon-400'}>
                    {clicks} click{clicks === 1 ? '' : 's'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-falcon-500">Event timeline</h2>
        {data.events.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No events yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {data.events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 rounded border border-falcon-100 px-3 py-2">
                <span
                  className={
                    ev.type === 'open'
                      ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                      : 'rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800'
                  }
                >
                  {ev.type}
                  {ev.type === 'open' && ev.isFirstOpen ? ' · first' : ''}
                </span>
                <span className="text-sm text-falcon-700" title={formatDate(ev.ts)}>
                  {formatRelative(ev.ts)}
                </span>
                <span className="text-xs text-falcon-500">{ev.uaClass}</span>
                {ev.country && <span className="text-xs text-falcon-500">{ev.country}</span>}
                {ev.linkId && (
                  <span className="ml-auto truncate text-xs text-falcon-400" title={ev.linkId}>
                    link #{ev.linkId.split(':')[1]}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

export default function EmailDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-6 py-8">
          <p className="text-sm text-falcon-500">Loading…</p>
        </main>
      }
    >
      <EmailDetailInner />
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
