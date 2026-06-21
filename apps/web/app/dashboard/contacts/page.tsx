'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  type ContactListItem,
  type ContactSort,
  listContacts,
} from '../../../lib/api'
import { AppHeader } from '../../../lib/AppHeader'

const SORT_OPTIONS: { key: ContactSort; label: string }[] = [
  { key: 'lastSeen-desc', label: 'Last engaged' },
  { key: 'sends-desc', label: 'Most sent' },
  { key: 'opens-desc', label: 'Most opens' },
  { key: 'replyRate-desc', label: 'Best reply rate' },
]

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

type Heat = 'hot' | 'warm' | 'cold' | 'dormant'

function classify(c: ContactListItem): Heat {
  const lastSendDiff = Date.now() - c.firstSeenAt
  if (c.sends > 0 && lastSendDiff > 60 * 86_400_000 && !c.lastEventAt) {
    return 'dormant'
  }
  if (c.lastEventAt == null) return 'cold'
  const ago = Date.now() - c.lastEventAt
  if (ago < 7 * 86_400_000) return 'hot'
  if (ago < 30 * 86_400_000) return 'warm'
  return 'cold'
}

const HEAT_STYLE: Record<Heat, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-amber-100 text-amber-700',
  cold: 'bg-slate-100 text-slate-600',
  dormant: 'bg-slate-100 text-slate-400',
}

export default function ContactsPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<ContactSort>('lastSeen-desc')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    listContacts({ limit: 50, sort, q })
      .then((res) => {
        setContacts(res.contacts)
        setCursor(res.nextCursor)
        setHasMore(res.nextCursor != null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'load_failed')
      })
      .finally(() => setLoading(false))
  }, [sort, q])

  const onQueryChange = (val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQ(val), 200)
  }

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await listContacts({ limit: 50, sort, cursor })
      setContacts((prev) => [...prev, ...res.contacts])
      setCursor(res.nextCursor)
      setHasMore(res.nextCursor != null)
    } finally {
      setLoadingMore(false)
    }
  }

  const totalContacts = contacts.length
  const activeIn7d = contacts.filter(
    (c) => c.lastEventAt != null && Date.now() - c.lastEventAt < 7 * 86_400_000,
  ).length
  const totalSends = contacts.reduce((a, c) => a + c.sends, 0)
  const totalOpens = contacts.reduce((a, c) => a + c.humanOpens, 0)
  const totalReplies = contacts.reduce((a, c) => a + c.replies, 0)
  const avgOpenRate =
    totalSends > 0 ? Math.round((100 * totalOpens) / totalSends) : 0
  const avgReplyRate =
    totalSends > 0 ? Math.round((100 * totalReplies) / totalSends) : 0

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <AppHeader />

      <main className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-falcon-700">Contacts</h1>
          <p className="mt-1 text-sm text-falcon-500">
            Every recipient you've tracked, with rolled-up engagement across
            all sends.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Tracked" value={totalContacts} hint="unique recipients on this page" />
          <StatCard label="Active 7d" value={activeIn7d} accent hint="engaged in last 7 days" />
          <StatCard label="Avg open rate" value={`${avgOpenRate}%`} />
          <StatCard label="Avg reply rate" value={`${avgReplyRate}%`} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search by name or address label…"
            className="min-w-0 flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ContactSort)}
            className="rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load: {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-falcon-500">Loading contacts…</p>
        ) : contacts.length === 0 ? (
          <div className="rounded-lg border border-falcon-200 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-falcon-700">
              No contacts yet
            </p>
            <p className="mt-1 text-xs text-falcon-500">
              Send a tracked email to start building your contact engagement
              history.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 inline-block text-sm font-medium text-falcon-700 hover:underline"
            >
              Back to dashboard →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-falcon-200 overflow-hidden rounded-lg border border-falcon-200 bg-white">
            {contacts.map((c) => {
              const heat = classify(c)
              const openRate = c.sends > 0 ? Math.round((100 * c.humanOpens) / c.sends) : 0
              return (
                <button
                  key={c.hashedAddr}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/contacts/detail?id=${encodeURIComponent(c.hashedAddr)}`,
                    )
                  }
                  className="block w-full text-left px-4 py-3 transition-colors hover:bg-falcon-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-falcon-700">
                        {c.displayLabel || '(no label)'}
                      </p>
                      <p className="mt-0.5 text-xs text-falcon-500 tabular-nums">
                        {c.sends} sent · {c.humanOpens} opens ({openRate}%) · {c.clicks} clicks · {c.replies} replies
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${HEAT_STYLE[heat]}`}
                      >
                        {heat}
                      </span>
                      <span className="text-[11px] text-falcon-400">
                        {c.lastEventAt
                          ? formatRelative(c.lastEventAt)
                          : 'never engaged'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {hasMore && contacts.length > 0 && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mx-auto block rounded-md border border-falcon-200 bg-white px-4 py-2 text-sm font-medium text-falcon-700 hover:bg-falcon-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
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
