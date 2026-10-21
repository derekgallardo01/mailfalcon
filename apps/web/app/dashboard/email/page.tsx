'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  type EmailDetail,
  followups,
  getEmailDetail,
  patchEmailMeta,
} from '../../../lib/api'
import { clearSession, getSession } from '../../../lib/auth-store'
import { config } from '../../../lib/config'
import {
  formatBrowser,
  formatDevice,
  formatET,
  formatETShort,
  formatLocation,
  formatOs,
  formatRelative,
} from '../../../lib/format'

function EmailDetailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [data, setData] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveCount, setLiveCount] = useState(0)
  const [followupMsg, setFollowupMsg] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [notes, setNotes] = useState('')
  const [notesStatus, setNotesStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  )
  const [muteBusy, setMuteBusy] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  async function toggleMute() {
    if (!data || !id) return
    setMuteBusy(true)
    const next = !data.email.notificationsMuted
    try {
      await patchEmailMeta(id, { notificationsMuted: next })
      setData({
        ...data,
        email: { ...data.email, notificationsMuted: next },
      })
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setMuteBusy(false)
    }
  }

  useEffect(() => {
    if (data) setNotes(data.email.notes)
  }, [data?.email.id])

  async function addTag(tag: string) {
    if (!data || !id) return
    const cleaned = tag.toLowerCase().trim()
    if (!cleaned || cleaned.length > 30) return
    if (data.email.tags.includes(cleaned)) {
      setNewTag('')
      return
    }
    const next = [...data.email.tags, cleaned].slice(0, 10)
    try {
      await patchEmailMeta(id, { tags: next })
      setData({ ...data, email: { ...data.email, tags: next } })
      setNewTag('')
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    }
  }

  async function removeTag(tag: string) {
    if (!data || !id) return
    const next = data.email.tags.filter((t) => t !== tag)
    try {
      await patchEmailMeta(id, { tags: next })
      setData({ ...data, email: { ...data.email, tags: next } })
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    }
  }

  async function commitNotes() {
    if (!data || !id) return
    if (notes === data.email.notes) return
    setNotesStatus('saving')
    try {
      await patchEmailMeta(id, { notes })
      setData({ ...data, email: { ...data.email, notes } })
      setNotesStatus('saved')
      setTimeout(() => setNotesStatus('idle'), 1500)
    } catch (err) {
      setNotesStatus('idle')
      if (err instanceof Error) setError(err.message)
    }
  }

  async function addFollowup(days: number) {
    if (!id) return
    setFollowupMsg(null)
    try {
      const res = await followups.create({
        emailId: id,
        remindAfterDays: days,
        condition: 'no_open',
      })
      const at = new Date(res.remindAt).toLocaleDateString()
      setFollowupMsg(`Reminder set for ${at} if no open by then.`)
    } catch (err) {
      if (err instanceof Error) setFollowupMsg(err.message)
    }
  }

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
        <p className="text-sm text-rose-400">{error ?? 'Unknown error'}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-falcon-400 hover:text-white transition-colors">
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

  // Map recipient ID → first non-bot open timestamp. Used to render the
  // "opened by N of M" block and the per-event recipient badge.
  const recipientLabels = new Map<string, string>()
  data.recipients.forEach((r, idx) => {
    recipientLabels.set(r.id, r.displayLabel ?? `Recipient ${idx + 1}`)
  })

  const openedRecipients = new Set<string>()
  let replyCount = 0
  for (const ev of data.events) {
    if (ev.type === 'open' && ev.recipientId && ev.uaClass !== 'bot') {
      openedRecipients.add(ev.recipientId)
    }
    if (ev.type === 'reply') replyCount++
  }
  const totalRecipients = data.recipients.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-falcon-200 pb-4">
        <div>
          <Link href="/dashboard" className="text-xs text-falcon-500 hover:text-falcon-700">
            ← All emails
          </Link>
          <h1 className="mt-1 max-w-xl truncate text-xl font-semibold text-falcon-700">
            {data.email.subject || (
              <span className="italic text-falcon-400">(no subject)</span>
            )}
          </h1>
          <p className="text-xs text-falcon-500" title={formatET(data.email.sentAt)}>
            Sent {formatRelative(data.email.sentAt)} · {data.email.recipientCount} recipient{data.email.recipientCount === 1 ? '' : 's'}
            {data.email.privacyMode && ' · privacy mode'}
            {data.email.notificationsMuted && ' · 🔕 muted'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {liveCount > 0 && (
            <span className="rounded-full bg-cyan-950/80 border border-cyan-700/60 px-2 py-0.5 text-xs font-medium text-cyan-300 animate-pulse">
              live · {liveCount} new
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {id && (
              <Link
                href={`/compose/?reply=${encodeURIComponent(id)}`}
                className="rounded-lg bg-electric-cyan px-3 py-1.5 text-xs font-bold text-falcon-50 shadow-sm hover:bg-electric-sky transition-colors"
                title="Reply in this thread — prefills recipient, subject, and quoted body"
              >
                ↩ Reply
              </Link>
            )}
            <button
              type="button"
              onClick={toggleMute}
              disabled={muteBusy}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                data.email.notificationsMuted
                  ? 'border-falcon-200 bg-falcon-100 text-white hover:bg-falcon-200'
                  : 'border-falcon-200 bg-falcon-100 text-falcon-400 hover:bg-falcon-200 hover:text-white'
              }`}
              title={
                data.email.notificationsMuted
                  ? 'Notifications for this email are muted. Click to unmute.'
                  : 'Mute push notifications for this email. Events still record on the dashboard.'
              }
            >
              {data.email.notificationsMuted ? '🔔 Unmute' : '🔕 Mute notifications'}
            </button>
          </div>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Opens" value={data.counts.opens} hint={`${data.counts.humanOpens} human`} />
        <StatCard label="Clicks" value={data.counts.clicks} />
        <StatCard label="Bot opens" value={data.counts.opens - data.counts.humanOpens} muted />
      </section>

      {/* High-engagement monetization callout banner */}
      {(data.counts.clicks >= 10 || data.counts.opens >= 10) && (
        <section className="mt-6 rounded-2xl border border-cyan-500/50 bg-gradient-to-r from-cyan-950/60 via-slate-900/90 to-cyan-950/60 p-5 shadow-xl shadow-cyan-950/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  High Engagement Detected
                </span>
              </div>
              <p className="text-sm font-semibold text-white">
                This email reached {data.counts.clicks >= 10 ? `${data.counts.clicks} link clicks` : `${data.counts.opens} opens`}!
              </p>
              <p className="text-xs text-slate-300">
                Upgrade to Pro ($7/mo) to unlock complete recipient device forensics, automated scanner filtering, and custom domain white-labeling.
              </p>
            </div>
            <Link
              href="/settings"
              className="shrink-0 rounded-lg bg-electric-cyan px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-electric-sky transition-colors"
            >
              Upgrade to Pro →
            </Link>
          </div>
        </section>
      )}

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-falcon-200 bg-falcon-100 px-4 py-3 shadow-sm">
        <span className="text-xs text-falcon-400 font-medium">
          Remind me if no open in
        </span>
        {[1, 3, 7].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => addFollowup(d)}
            className="rounded-lg border border-falcon-200 bg-falcon-50 px-3 py-1 text-xs font-medium text-falcon-600 hover:text-white hover:bg-falcon-200 transition-colors"
          >
            {d} day{d === 1 ? '' : 's'}
          </button>
        ))}
        {followupMsg && (
          <span className="text-xs text-electric-cyan font-medium">{followupMsg}</span>
        )}
      </section>

      {totalRecipients > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-falcon-400">
            Recipients · {openedRecipients.size} of {totalRecipients} opened
            {replyCount > 0 && ` · ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.recipients.map((r, idx) => {
              const opened = openedRecipients.has(r.id)
              const label = r.displayLabel ?? `Recipient ${idx + 1}`
              return (
                <li
                  key={r.id}
                  className={
                    opened
                      ? 'rounded-full bg-emerald-950/80 border border-emerald-700/60 px-3 py-1 text-xs font-medium text-emerald-300'
                      : 'rounded-full border border-falcon-200 bg-falcon-100 px-3 py-1 text-xs text-falcon-400'
                  }
                >
                  {opened ? '✓ ' : ''}
                  {label}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-falcon-400">Links</h2>
        {data.links.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No tracked links.</p>
        ) : (
          <ul className="mt-3 divide-y divide-falcon-200 rounded-xl border border-falcon-200 bg-falcon-100 overflow-hidden shadow-sm">
            {data.links.map((l) => {
              const linkId = `${data.email.id}:${l.idx}`
              const clicks = clicksByLink.get(linkId) ?? 0
              return (
                <li key={l.idx} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-falcon-600 font-medium" title={l.originalUrl}>
                      {l.originalUrl}
                    </p>
                  </div>
                  <span className={clicks > 0 ? 'text-sm font-bold text-cyan-400' : 'text-sm text-falcon-400'}>
                    {clicks} click{clicks === 1 ? '' : 's'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-falcon-200 bg-falcon-100 p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-falcon-400">
          Tags
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {data.email.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-falcon-50 border border-falcon-200 px-3 py-1 text-xs font-medium text-falcon-600"
            >
              #{t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-falcon-400 hover:text-rose-400 transition-colors"
                aria-label={`Remove tag ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          {data.email.tags.length < 10 && (
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addTag(newTag)
                }
              }}
              placeholder="+ add tag"
              className="rounded-full border border-dashed border-falcon-200 bg-falcon-50 px-3 py-1 text-xs text-white placeholder-falcon-400 focus:border-electric-cyan focus:outline-none transition-colors"
              maxLength={30}
            />
          )}
        </div>

        <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-falcon-400">
          Notes
          {notesStatus === 'saving' && (
            <span className="ml-2 text-falcon-400">saving…</span>
          )}
          {notesStatus === 'saved' && (
            <span className="ml-2 text-emerald-400">saved</span>
          )}
        </h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void commitNotes()}
          placeholder="Private notes for yourself — recipients don't see this."
          rows={3}
          maxLength={5000}
          className="mt-2 w-full rounded-lg border border-falcon-200 bg-falcon-50 px-3 py-2 text-sm text-white placeholder-falcon-400 focus:border-electric-cyan focus:outline-none transition-colors"
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-falcon-400">Event timeline</h2>
        {data.events.length === 0 ? (
          <p className="mt-2 text-sm text-falcon-400">No events yet.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {data.events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-falcon-200 bg-falcon-100 px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      ev.type === 'open'
                        ? 'rounded-full bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300'
                        : ev.type === 'reply'
                        ? 'rounded-full bg-violet-950/80 border border-violet-700/60 px-2.5 py-0.5 text-xs font-semibold text-violet-300'
                        : 'rounded-full bg-cyan-950/80 border border-cyan-700/60 px-2.5 py-0.5 text-xs font-semibold text-cyan-300'
                    }
                  >
                    {ev.type}
                    {ev.type === 'open' && ev.isFirstOpen ? ' · first' : ''}
                    {ev.type === 'click' && ev.linkId
                      ? ` · #${ev.linkId.split(':')[1]}`
                      : ''}
                  </span>
                  {ev.recipientId && recipientLabels.has(ev.recipientId) && (
                    <span className="rounded-full bg-falcon-50 border border-falcon-200 px-2.5 py-0.5 text-xs font-medium text-falcon-600">
                      {recipientLabels.get(ev.recipientId)}
                    </span>
                  )}
                  <span className="text-white font-medium" title={formatET(ev.ts)}>
                    {formatETShort(ev.ts)}
                  </span>
                  <span className="text-xs text-falcon-400">
                    ({formatRelative(ev.ts)})
                  </span>
                </div>
                {ev.type !== 'reply' && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-falcon-400">
                  <span>{formatBrowser(ev)}</span>
                  <span>{formatOs(ev)}</span>
                  <span>{formatDevice(ev)}</span>
                  <span>{formatLocation(ev)}</span>
                  {ev.ipPrefix && (
                    <span className="font-mono text-falcon-300">{ev.ipPrefix}</span>
                  )}
                  {ev.timezone && <span>{ev.timezone}</span>}
                </div>
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
          <p className="text-sm text-falcon-400">Loading…</p>
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
    <div className={`rounded-xl border border-falcon-200 bg-falcon-100 p-4 shadow-sm ${muted ? 'opacity-60' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-falcon-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-xs text-falcon-400">{hint}</p>}
    </div>
  )
}
