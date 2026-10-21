'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { config } from '../../lib/config'

const CWS_URL =
  'https://chromewebstore.google.com/detail/jbhhoinolhpcaghdlkndkmhlhofblnka'

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_useful', label: "It wasn't useful for me" },
  { value: 'buggy', label: 'Something was broken or buggy' },
  { value: 'privacy', label: 'Privacy or permissions concerns' },
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'switched', label: 'Switched to another tool' },
  { value: 'temporary', label: 'Just temporary — I might be back' },
  { value: 'other', label: 'Something else' },
]

function UninstallInner() {
  const searchParams = useSearchParams()
  const [reason, setReason] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!reason) return
    setBusy(true)
    try {
      await fetch(`${config.apiHost}/uninstall-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          comment: comment.trim() || undefined,
          installId: searchParams.get('iid') || undefined,
          version: searchParams.get('v') || undefined,
        }),
      })
    } catch {
      // Feedback is best-effort — always show the thanks state.
    }
    setSent(true)
    setBusy(false)
  }

  return (
    <main className="mx-auto mt-24 max-w-md px-6 pb-24">
      <div className="rounded-lg border border-falcon-200 bg-falcon-100 p-6">
        <div className="flex items-center gap-2">
          <img src="/falcon.png" alt="" width={28} height={28} className="h-7 w-7 rounded" />
          <span className="text-lg font-semibold text-falcon-700">Mail Falcon</span>
        </div>

        {sent ? (
          <>
            <p className="mt-6 text-xl font-semibold text-falcon-700">
              Thanks for the feedback
            </p>
            <p className="mt-2 text-sm text-falcon-500">
              We read every response. If you ever want tracking, sequences, and
              spoof-detection back in Gmail, reinstalling takes ten seconds.
            </p>
            <a
              href={CWS_URL}
              className="mt-5 inline-block rounded-lg bg-electric-cyan px-4 py-2.5 text-sm font-bold text-falcon-50 hover:bg-electric-sky transition-colors shadow-md"
            >
              Reinstall Mail Falcon
            </a>
          </>
        ) : (
          <>
            <p className="mt-6 text-xl font-semibold text-falcon-700">
              Sorry to see you go
            </p>
            <p className="mt-2 text-sm text-falcon-500">
              Mail Falcon has been uninstalled. Mind telling us why? One click
              helps us fix what drove you away.
            </p>

            <div className="mt-5 space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    reason === r.value
                      ? 'border-electric-cyan bg-falcon-200 text-falcon-700'
                      : 'border-falcon-200 text-falcon-500 hover:border-falcon-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[#22d3ee]"
                  />
                  {r.label}
                </label>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Anything else? (optional)"
              className="mt-4 w-full rounded-lg border border-falcon-200 bg-falcon-50 px-3 py-2 text-sm text-falcon-700 placeholder:text-falcon-400 focus:border-electric-cyan focus:outline-none"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!reason || busy}
              className="mt-4 w-full rounded-lg bg-electric-cyan px-4 py-2.5 text-sm font-bold text-falcon-50 hover:bg-electric-sky disabled:opacity-50 transition-colors shadow-md"
            >
              {busy ? 'Sending…' : 'Send feedback'}
            </button>

            <p className="mt-4 text-center text-xs text-falcon-500">
              Changed your mind?{' '}
              <a href={CWS_URL} className="text-electric-cyan hover:underline">
                Reinstall from the Chrome Web Store
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}

export default function UninstallPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto mt-24 max-w-md px-6">
          <p className="text-sm">Loading…</p>
        </main>
      }
    >
      <UninstallInner />
    </Suspense>
  )
}
