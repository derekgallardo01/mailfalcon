'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type ComposeAttachment,
  type ComposeThreadContext,
  type GmailComposeStatus,
  composeSend,
  getComposeThreadContext,
  getGmailComposeStatus,
} from '../../lib/api'
import { getSession } from '../../lib/auth-store'

/** Gmail's per-message limit is 25MB, but that's the raw MIME size —
 *  base64 inflates ~33%. Cap at 18MB decoded so the post-encode payload
 *  stays under Gmail's actual limit AND under our worker's request-body
 *  cap. Enforced client-side to avoid a wasted upload round-trip. */
const MAX_ATTACHMENTS_BYTES = 18 * 1024 * 1024

interface AttachmentDraft extends ComposeAttachment {
  /** Client-only id + decoded size for the UI list. */
  id: string
  sizeBytes: number
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Read a File as standard base64 (not base64url). Handles arbitrary
 *  binary content — FileReader.readAsDataURL gives us "data:mime;base64,..."
 *  which we strip the prefix from. */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

const DRAFT_KEY = 'mf.compose.draft'
const DRAFT_SAVE_INTERVAL_MS = 3_000

interface LocalDraft {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  updatedAt: number
}

function readLocalDraft(): LocalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalDraft
    if (!parsed.updatedAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalDraft(d: LocalDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* quota exceeded / private mode — ignore */
  }
}

function clearLocalDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

function draftIsEmpty(d: LocalDraft): boolean {
  return (
    !d.to.trim() &&
    !d.cc.trim() &&
    !d.bcc.trim() &&
    !d.subject.trim() &&
    !d.body.trim()
  )
}

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
  const [draftLoadedAt, setDraftLoadedAt] = useState<number | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const [pendingDraft, setPendingDraft] = useState<LocalDraft | null>(null)
  const [replyContext, setReplyContext] = useState<ComposeThreadContext | null>(null)
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const attachmentsBytes = attachments.reduce((s, a) => s + a.sizeBytes, 0)

  async function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    setAttachError(null)
    setAttachBusy(true)
    try {
      const added: AttachmentDraft[] = []
      let running = attachmentsBytes
      for (const f of Array.from(files)) {
        if (running + f.size > MAX_ATTACHMENTS_BYTES) {
          setAttachError(
            `Skipped ${f.name} — combined attachments would exceed 18 MB (Gmail limit).`,
          )
          continue
        }
        const dataBase64 = await fileToBase64(f)
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          filename: f.name,
          mimeType: f.type || 'application/octet-stream',
          dataBase64,
          sizeBytes: f.size,
        })
        running += f.size
      }
      setAttachments((prev) => [...prev, ...added])
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'attach_failed')
    } finally {
      setAttachBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

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

    // Reply-in-thread prefill. When ?reply=<trackedEmailId> is on
    // the URL, fetch the thread context (last message's from, subject,
    // quoted body, In-Reply-To, References) and populate the form.
    // Skip draft-banner rendering when replying — reply prefill wins.
    const url = new URL(window.location.href)
    const replyId = url.searchParams.get('reply')
    if (replyId) {
      setReplyLoading(true)
      void getComposeThreadContext(replyId)
        .then((ctx) => {
          setReplyContext(ctx)
          setToRaw(ctx.to)
          setSubject(ctx.subject)
          setBody(ctx.quotedBody)
          // Position cursor at the very top of the body so the user
          // can start typing above the quote.
          setTimeout(() => {
            if (bodyRef.current) {
              bodyRef.current.focus()
              bodyRef.current.setSelectionRange(0, 0)
              bodyRef.current.scrollTop = 0
            }
          }, 50)
        })
        .catch((err) => {
          setReplyError(err instanceof Error ? err.message : 'reply_load_failed')
        })
        .finally(() => setReplyLoading(false))
      return
    }

    // Surface any in-flight local draft as a dismissible banner —
    // never a blocking OS dialog.
    const existing = readLocalDraft()
    if (existing && !draftIsEmpty(existing)) {
      setPendingDraft(existing)
    }
  }, [])

  function resumePendingDraft() {
    if (!pendingDraft) return
    setToRaw(pendingDraft.to)
    setCcRaw(pendingDraft.cc)
    setBccRaw(pendingDraft.bcc)
    setSubject(pendingDraft.subject)
    setBody(pendingDraft.body)
    if (pendingDraft.cc || pendingDraft.bcc) setShowCcBcc(true)
    setDraftLoadedAt(pendingDraft.updatedAt)
    setPendingDraft(null)
  }

  function dismissPendingDraft() {
    clearLocalDraft()
    setPendingDraft(null)
  }

  // Auto-save the local draft every N seconds while the form has
  // content. Cheap (single localStorage write); no server round-trip.
  useEffect(() => {
    const d: LocalDraft = {
      to: toRaw,
      cc: ccRaw,
      bcc: bccRaw,
      subject,
      body,
      updatedAt: Date.now(),
    }
    if (draftIsEmpty(d)) return
    const t = setTimeout(() => {
      writeLocalDraft(d)
      setDraftSavedAt(d.updatedAt)
    }, DRAFT_SAVE_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [toRaw, ccRaw, bccRaw, subject, body])

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
        ...(replyContext?.threadId ? { threadId: replyContext.threadId } : {}),
        ...(replyContext?.inReplyToMessageId
          ? { inReplyToMessageId: replyContext.inReplyToMessageId }
          : {}),
        ...(replyContext?.references
          ? { references: replyContext.references }
          : {}),
        ...(attachments.length > 0
          ? {
              attachments: attachments.map(({ id, sizeBytes, ...a }) => a),
            }
          : {}),
      })
      clearLocalDraft()
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
    setDraftLoadedAt(null)
    setDraftSavedAt(null)
    setAttachments([])
    setAttachError(null)
    setReplyContext(null)
    clearLocalDraft()
    setTimeout(() => bodyRef.current?.focus(), 50)
  }

  function discardDraft() {
    if (!window.confirm('Discard this draft? Any unsent changes will be lost.')) {
      return
    }
    reset()
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

      {replyLoading && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Loading reply context…
        </div>
      )}

      {replyError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Couldn&rsquo;t load the source message: {replyError}. Starting a fresh compose instead.
        </div>
      )}

      {replyContext && !replyLoading && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="font-semibold">Replying in thread</span>
          {replyContext.originalSnippet && (
            <span className="ml-2 text-blue-800/80">
              &mdash; &ldquo;{replyContext.originalSnippet.slice(0, 80)}
              {replyContext.originalSnippet.length > 80 ? '…' : ''}&rdquo;
            </span>
          )}
        </div>
      )}

      {pendingDraft && !replyContext && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Unsent draft from {formatDraftAge(pendingDraft.updatedAt)}
            {pendingDraft.subject && (
              <span className="ml-1 text-amber-800/80">
                &mdash; &ldquo;{pendingDraft.subject.slice(0, 60)}
                {pendingDraft.subject.length > 60 ? '…' : ''}&rdquo;
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resumePendingDraft}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={dismissPendingDraft}
              className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Discard
            </button>
          </div>
        </div>
      )}

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

        {attachments.length > 0 && (
          <div className="border-t border-falcon-100 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-falcon-200 bg-falcon-50 px-2 py-1 text-xs"
                >
                  <span aria-hidden>📎</span>
                  <span className="max-w-[180px] truncate font-medium text-falcon-700">
                    {a.filename}
                  </span>
                  <span className="text-[10px] text-falcon-500">
                    {formatBytes(a.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="rounded p-0.5 text-falcon-400 hover:bg-red-100 hover:text-red-600"
                    aria-label={`Remove ${a.filename}`}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-falcon-500">
              {formatBytes(attachmentsBytes)} of {formatBytes(MAX_ATTACHMENTS_BYTES)}
            </p>
          </div>
        )}

        {attachError && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
            {attachError}
          </div>
        )}

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
          <div className="flex flex-col gap-0.5 text-[11px] text-falcon-500">
            <span>Every link tracked · Pixel added</span>
            {draftSavedAt && (
              <span className="text-falcon-500">
                Draft saved
                {draftLoadedAt && draftLoadedAt !== draftSavedAt && ' · resumed'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void onFilesPicked(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachBusy}
              className="rounded-md border border-falcon-300 bg-white px-3 py-2 text-xs font-semibold text-falcon-700 hover:bg-falcon-50 disabled:opacity-50"
              title="Attach files (up to 18 MB combined)"
            >
              {attachBusy ? 'Reading…' : '📎 Attach'}
            </button>
            {(toRaw || subject || body || ccRaw || bccRaw || attachments.length > 0) && (
              <button
                type="button"
                onClick={discardDraft}
                className="rounded-md border border-falcon-300 bg-white px-3 py-2 text-xs font-semibold text-falcon-700 hover:bg-falcon-50"
              >
                Discard
              </button>
            )}
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-md bg-falcon-500 px-5 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendState.kind === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </div>
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

function formatDraftAge(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
