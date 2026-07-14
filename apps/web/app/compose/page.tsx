'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type GmailComposeStatus,
  composeSend,
  getGmailComposeStatus,
} from '../../lib/api'
import { getSession } from '../../lib/auth-store'

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; emailId: string }
  | { kind: 'error'; message: string }

const ADDR_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Split a To/Cc/Bcc string into addresses. Users often paste "a, b, c"
 *  or type addresses separated by spaces; support both. */
function parseAddresses(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const valid: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    if (ADDR_RE.test(p)) valid.push(p)
    else invalid.push(p)
  }
  return { valid, invalid }
}

export default function ComposePage() {
  const [status, setStatus] = useState<GmailComposeStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [toRaw, setToRaw] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [ccRaw, setCcRaw] = useState('')
  const [bccRaw, setBccRaw] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sendState, setSendState] = useState<SendState>({ kind: 'idle' })
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!getSession()) {
      window.location.assign('/sign-in/')
      return
    }
    void getGmailComposeStatus()
      .then((s) => {
        setStatus(s)
      })
      .catch(() => setStatus({ connected: false }))
      .finally(() => setStatusLoading(false))
  }, [])

  const parsedTo = useMemo(() => parseAddresses(toRaw), [toRaw])
  const parsedCc = useMemo(() => parseAddresses(ccRaw), [ccRaw])
  const parsedBcc = useMemo(() => parseAddresses(bccRaw), [bccRaw])

  const canSend =
    status?.connected &&
    parsedTo.valid.length > 0 &&
    parsedTo.invalid.length === 0 &&
    parsedCc.invalid.length === 0 &&
    parsedBcc.invalid.length === 0 &&
    body.trim().length > 0 &&
    sendState.kind !== 'sending'

  async function onSend() {
    if (!canSend) return
    setSendState({ kind: 'sending' })
    try {
      // Body typed in the textarea is plaintext. Convert newlines to
      // <br> so the recipient sees line breaks — Gmail's HTML renderer
      // otherwise collapses whitespace. Escape HTML chars in the user
      // content since we're producing raw HTML.
      const bodyHtml = escapeHtml(body).replace(/\n/g, '<br>')
      const res = await composeSend({
        to: parsedTo.valid,
        cc: parsedCc.valid,
        bcc: parsedBcc.valid,
        subject,
        bodyHtml,
      })
      setSendState({ kind: 'sent', emailId: res.emailId })
    } catch (err) {
      setSendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'send_failed',
      })
    }
  }

  function reset() {
    setToRaw('')
    setCcRaw('')
    setBccRaw('')
    setSubject('')
    setBody('')
    setShowCcBcc(false)
    setSendState({ kind: 'idle' })
    setTimeout(() => bodyRef.current?.focus(), 50)
  }

  if (statusLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-falcon-200 border-t-falcon-600" />
      </main>
    )
  }

  if (!status?.connected) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-5xl">📱</div>
        <h1 className="text-xl font-semibold text-falcon-700">Connect Gmail first</h1>
        <p className="mt-2 text-sm text-falcon-500">
          To send tracked emails from your phone or any browser, you need to
          connect your Gmail account once from the Settings page.
        </p>
        <Link
          href="/settings/"
          className="mt-6 rounded-md bg-falcon-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-falcon-600"
        >
          Go to Settings
        </Link>
      </main>
    )
  }

  if (sendState.kind === 'sent') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="text-xl font-semibold text-falcon-700">Sent</h1>
        <p className="mt-2 text-sm text-falcon-500">
          Your tracked email is on its way. Open events will show up on the dashboard as recipients read it.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/dashboard/email/?id=${encodeURIComponent(sendState.emailId)}`}
            className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600"
          >
            View tracking
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-falcon-300 bg-white px-4 py-2 text-sm font-semibold text-falcon-700 hover:bg-falcon-50"
          >
            New email
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-4 sm:py-6">
      <header className="mb-3 flex items-center justify-between">
        <Link href="/dashboard/" className="text-sm font-medium text-falcon-500 hover:text-falcon-700">
          ← Dashboard
        </Link>
        <span className="text-[11px] text-falcon-500">
          Sending as <span className="font-mono">{status.googleEmail}</span>
        </span>
      </header>

      <form
        className="flex flex-1 flex-col rounded-lg border border-falcon-200 bg-white shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void onSend()
        }}
      >
        <FieldRow label="To">
          <input
            type="text"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="alice@example.com"
            value={toRaw}
            onChange={(e) => setToRaw(e.target.value)}
            className="w-full bg-transparent text-sm text-falcon-700 outline-none placeholder:text-falcon-400"
          />
          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="ml-2 whitespace-nowrap text-[11px] font-medium text-falcon-500 hover:text-falcon-700"
            >
              Cc/Bcc
            </button>
          )}
        </FieldRow>

        {showCcBcc && (
          <>
            <FieldRow label="Cc">
              <input
                type="text"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={ccRaw}
                onChange={(e) => setCcRaw(e.target.value)}
                className="w-full bg-transparent text-sm text-falcon-700 outline-none"
              />
            </FieldRow>
            <FieldRow label="Bcc">
              <input
                type="text"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={bccRaw}
                onChange={(e) => setBccRaw(e.target.value)}
                className="w-full bg-transparent text-sm text-falcon-700 outline-none"
              />
            </FieldRow>
          </>
        )}

        <FieldRow label="Subject">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-transparent text-sm text-falcon-700 outline-none placeholder:text-falcon-400"
          />
        </FieldRow>

        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your message…"
          className="flex-1 min-h-[240px] resize-none border-t border-falcon-100 bg-transparent p-4 text-sm leading-relaxed text-falcon-800 outline-none placeholder:text-falcon-400 sm:min-h-[400px]"
        />

        {(parsedTo.invalid.length > 0 || parsedCc.invalid.length > 0 || parsedBcc.invalid.length > 0) && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] text-red-700">
            Invalid addresses: {[...parsedTo.invalid, ...parsedCc.invalid, ...parsedBcc.invalid].join(', ')}
          </div>
        )}

        {sendState.kind === 'error' && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            Send failed: {sendState.message}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-falcon-200 bg-falcon-50 px-3 py-3">
          <span className="text-[11px] text-falcon-500">
            Every link is tracked · Pixel added automatically
          </span>
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-md bg-falcon-500 px-5 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendState.kind === 'sending' ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </main>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-falcon-100 px-3 py-2.5">
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-falcon-500">
        {label}
      </span>
      <div className="flex flex-1 items-center">{children}</div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
