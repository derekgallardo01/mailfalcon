'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  type EmailListItem,
  type EmailSort,
  type MeResponse,
  getMe,
  listEmailTags,
  listEmails,
  startCheckout,
} from '../../lib/api'
import { AppHeader } from '../../lib/AppHeader'
import { clearSession, getSession, type Session } from '../../lib/auth-store'
import { config } from '../../lib/config'
import { formatLocalShort } from '../../lib/format'

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const MONTHDAY_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** Shorter format for the table — recent stays relative, older shows
 *  the day of week or date. Keeps the column narrow + readable. */
function formatSent(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return WEEKDAY_FMT.format(new Date(ts))
  return MONTHDAY_FMT.format(new Date(ts))
}

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

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

const SORT_OPTIONS: { key: EmailSort; label: string }[] = [
  { key: 'sentAt-desc', label: 'Newest first' },
  { key: 'sentAt-asc', label: 'Oldest first' },
  { key: 'opens-desc', label: 'Most opens' },
  { key: 'clicks-desc', label: 'Most clicks' },
]

function DashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [session, setSessionState] = useState<Session | null>(null)
  const [emails, setEmails] = useState<EmailListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveCount, setLiveCount] = useState(0)
  const [me, setMe] = useState<MeResponse | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const isAdmin = me?.tier === 'admin'
  const isFree = me?.tier === 'free'

  // Filter state mirrors URL; debounce only the search input.
  const urlQ = searchParams.get('q') ?? ''
  const urlSort = (searchParams.get('sort') as EmailSort | null) ?? 'sentAt-desc'
  const urlDate = (searchParams.get('date') as DatePreset | null) ?? 'all'
  const urlTag = searchParams.get('tag') ?? ''
  const [qInput, setQInput] = useState(urlQ)
  const [tagOptions, setTagOptions] = useState<string[]>([])

  // Keep the search box in sync if URL changes (e.g. via "Clear filters").
  useEffect(() => {
    setQInput(urlQ)
  }, [urlQ])

  function updateParams(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    router.replace(qs ? `/dashboard?${qs}` : '/dashboard', { scroll: false })
  }

  // Debounce the search box → URL.
  useEffect(() => {
    if (qInput === urlQ) return
    const t = setTimeout(() => updateParams({ q: qInput.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  useEffect(() => {
    const s = getSession()
    if (!s) {
      router.replace('/sign-in')
      return
    }
    setSessionState(s)

    function refresh() {
      return listEmails({
        q: urlQ || undefined,
        sort: urlSort,
        from: presetToFrom(urlDate),
        limit: 100,
        ...(urlTag ? { tag: urlTag } : {}),
      })
        .then((res) => setEmails(res.emails))
        .catch((err) => {
          if (err instanceof Error && err.message === 'unauthorized') {
            clearSession()
            router.replace('/sign-in')
            return
          }
          setError(err instanceof Error ? err.message : 'Failed to load')
        })
    }

    refresh().finally(() => setLoading(false))

    getMe()
      .then(setMe)
      .catch(() => undefined)

    listEmailTags()
      .then(setTagOptions)
      .catch(() => undefined)

    const url = new URL(`${config.apiHost}/stream`)
    url.searchParams.set('token', s.token)
    const es = new EventSource(url.toString())
    esRef.current = es
    es.addEventListener('event', () => {
      setLiveCount((c) => c + 1)
      void refresh()
    })
    es.addEventListener('error', () => {
      // EventSource auto-reconnects, no action required
    })

    return () => {
      es.close()
      esRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, urlQ, urlSort, urlDate, urlTag])

  async function handleUpgrade() {
    try {
      const url = await startCheckout()
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed')
    }
  }

  if (!session) return null

  const hasFilters =
    urlQ || urlSort !== 'sentAt-desc' || urlDate !== 'all' || urlTag

  const stats = (() => {
    const sent = emails.length
    const opens = emails.reduce((s, e) => s + e.humanOpenCount, 0)
    const clicks = emails.reduce((s, e) => s + e.clickCount, 0)
    const opened = emails.filter((e) => e.humanOpenCount > 0).length
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0
    return { sent, opens, clicks, openRate }
  })()

  const dateScopeLabel = (() => {
    if (urlDate === 'today') return 'today'
    if (urlDate === '7d') return 'last 7 days'
    if (urlDate === '30d') return 'last 30 days'
    return 'all time'
  })()

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <AppHeader liveCount={liveCount} />

      {isFree && me && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-falcon-200 bg-falcon-50 px-4 py-2.5 text-xs text-falcon-700">
          <span>
            Free plan · <strong>{me.usage.used}</strong> / {me.usage.limit} tracked emails today
          </span>
          <button
            type="button"
            onClick={handleUpgrade}
            className="font-medium text-falcon-500 hover:text-falcon-700"
          >
            Upgrade to Pro →
          </button>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={`Sent · ${dateScopeLabel}`} value={stats.sent} />
        <StatCard label="Opens" value={stats.opens} />
        <StatCard label="Open rate" value={`${stats.openRate}%`} hint={`${emails.filter((e) => e.humanOpenCount > 0).length} of ${stats.sent}`} />
        <StatCard label="Clicks" value={stats.clicks} accent={stats.clicks > 0} />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-falcon-200 bg-white px-3 py-2">
        <div className="relative min-w-[220px] flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-falcon-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search subject + notes…"
            className="w-full rounded border border-falcon-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-falcon-500 focus:outline-none"
          />
        </div>
        <select
          value={urlSort}
          onChange={(e) => updateParams({ sort: e.target.value === 'sentAt-desc' ? '' : e.target.value })}
          className="rounded border border-falcon-200 bg-white px-3 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded border border-falcon-200 bg-white text-xs">
          {DATE_PRESETS.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => updateParams({ date: p.key === 'all' ? '' : p.key })}
              className={`px-3 py-1.5 ${i > 0 ? 'border-l border-falcon-200' : ''} ${
                urlDate === p.key
                  ? 'bg-falcon-100 font-medium text-falcon-700'
                  : 'text-falcon-500 hover:bg-falcon-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {tagOptions.length > 0 && (
          <select
            value={urlTag}
            onChange={(e) => updateParams({ tag: e.target.value })}
            className="rounded border border-falcon-200 bg-white px-3 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
          >
            <option value="">All tags</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQInput('')
              router.replace('/dashboard', { scroll: false })
            }}
            className="ml-auto rounded border border-falcon-200 px-2 py-1 text-xs text-falcon-500 hover:bg-falcon-50 hover:text-falcon-700"
          >
            Clear
          </button>
        )}
      </div>

      <main className="mt-6">
        {loading && <p className="text-sm text-falcon-500">Loading…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && emails.length === 0 && !hasFilters && (
          <div className="rounded border border-dashed border-falcon-200 bg-white p-10 text-center">
            <p className="text-base font-semibold text-falcon-700">
              No tracked emails yet
            </p>
            <p className="mt-1 text-sm text-falcon-500">
              Three steps to your first tracked send:
            </p>
            <ol className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-4 text-left text-sm md:grid-cols-3">
              <li className="rounded border border-falcon-100 bg-falcon-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-falcon-400">
                  Step 1
                </p>
                <p className="mt-2 text-falcon-700">
                  Compose a message in{' '}
                  <a
                    href="https://mail.google.com/"
                    target="_blank"
                    rel="noopener"
                    className="text-falcon-500 underline hover:text-falcon-700"
                  >
                    Gmail
                  </a>
                  .
                </p>
              </li>
              <li className="rounded border border-falcon-100 bg-falcon-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-falcon-400">
                  Step 2
                </p>
                <p className="mt-2 text-falcon-700">
                  Leave the <strong>Privacy mode</strong> checkbox above the
                  body unchecked.
                </p>
              </li>
              <li className="rounded border border-falcon-100 bg-falcon-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-falcon-400">
                  Step 3
                </p>
                <p className="mt-2 text-falcon-700">
                  Hit Send. Opens + clicks land here within ~5 seconds of the
                  recipient interacting.
                </p>
              </li>
            </ol>
            <p className="mt-6 text-xs text-falcon-400">
              The first open often comes from Gmail's image proxy in a Google
              data center — we filter those out of your notifications and
              they show as <code className="font-mono">bot</code> opens.
            </p>
          </div>
        )}
        {!loading && !error && emails.length === 0 && hasFilters && (
          <div className="rounded border border-dashed border-falcon-200 bg-white p-8 text-center">
            <p className="text-sm text-falcon-700">No emails match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setQInput('')
                router.replace('/dashboard', { scroll: false })
              }}
              className="mt-2 text-xs text-falcon-500 hover:text-falcon-700"
            >
              Clear filters
            </button>
          </div>
        )}
        {!loading && !error && emails.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-falcon-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-[11px] uppercase tracking-wide text-falcon-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                  <th className="px-3 py-2.5 text-right font-medium">To</th>
                  <th className="px-3 py-2.5 text-right font-medium">Opens</th>
                  <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-falcon-100">
                {emails.map((e) => {
                  const opened = e.humanOpenCount > 0
                  const clicked = e.clickCount > 0
                  const botOpens = e.openCount - e.humanOpenCount
                  return (
                    <tr
                      key={e.id}
                      className="group cursor-pointer transition-colors hover:bg-falcon-50"
                      onClick={() => router.push(`/dashboard/email?id=${e.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/email?id=${e.id}`}
                          className="flex max-w-md items-center gap-2 truncate text-falcon-700 group-hover:text-falcon-900"
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                              clicked
                                ? 'bg-blue-500'
                                : opened
                                ? 'bg-emerald-500'
                                : 'bg-falcon-200'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {e.subject || (
                              <span className="italic text-falcon-400">(no subject)</span>
                            )}
                          </span>
                          {e.privacyMode && (
                            <span className="rounded bg-falcon-100 px-1.5 py-0.5 text-[10px] font-medium text-falcon-500">
                              privacy
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-falcon-500">
                        {e.recipientCount}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        title={
                          botOpens > 0
                            ? `${e.humanOpenCount} human, ${botOpens} bot (Gmail prefetch)`
                            : undefined
                        }
                      >
                        <span
                          className={
                            opened
                              ? 'font-semibold text-emerald-700'
                              : 'text-falcon-300'
                          }
                        >
                          {e.humanOpenCount}
                        </span>
                        {botOpens > 0 && (
                          <span className="ml-1 text-[10px] text-falcon-300">
                            +{botOpens} bot
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span
                          className={
                            clicked
                              ? 'font-semibold text-blue-700'
                              : 'text-falcon-300'
                          }
                        >
                          {e.clickCount}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right text-falcon-500 tabular-nums"
                        title={new Date(e.sentAt).toLocaleString()}
                      >
                        <div className="text-falcon-700">{formatLocalShort(e.sentAt)}</div>
                        <div className="text-[11px] text-falcon-400">{formatSent(e.sentAt)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-falcon-500 tabular-nums">
                        {e.lastEventAt ? (
                          <>
                            <div className="text-falcon-700">{formatLocalShort(e.lastEventAt)}</div>
                            <div className="text-[11px] text-falcon-400">{formatRelative(e.lastEventAt)}</div>
                          </>
                        ) : (
                          <span className="text-falcon-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: number | string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-falcon-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? 'text-blue-700' : 'text-falcon-700'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-falcon-400">{hint}</p>}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-6 py-6">
          <p className="text-sm text-falcon-500">Loading…</p>
        </main>
      }
    >
      <DashboardInner />
    </Suspense>
  )
}
