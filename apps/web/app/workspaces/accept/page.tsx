'use client'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { acceptInvite, previewInvite } from '../../../lib/api'
import { getSession } from '../../../lib/auth-store'

function AcceptInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''
  const [preview, setPreview] = useState<{
    workspaceName: string
    inviterEmail: string
    inviteEmail: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('missing_token')
      setLoading(false)
      return
    }
    previewInvite(token)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : 'preview_failed'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    setBusy(true)
    setError(null)
    const session = getSession()
    if (!session) {
      // Redirect to sign-in, returning to this page on success.
      const ret = encodeURIComponent(`/workspaces/accept?token=${token}`)
      router.push(`/sign-in?return=${ret}`)
      return
    }
    if (preview && session.email.toLowerCase() !== preview.inviteEmail.toLowerCase()) {
      setError(
        `This invite is for ${preview.inviteEmail}. You're signed in as ${session.email}.`,
      )
      setBusy(false)
      return
    }
    try {
      await acceptInvite(token)
      window.location.assign('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'accept_failed')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-md px-6">
      <div className="rounded-lg border border-falcon-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <img src="/falcon.png" alt="" width={28} height={28} className="h-7 w-7 rounded" />
          <span className="text-lg font-semibold text-falcon-700">MailFalcon</span>
        </div>

        {loading && <p className="mt-6 text-sm text-falcon-500">Loading invite…</p>}

        {error && !preview && (
          <div className="mt-6">
            <p className="text-sm font-semibold text-red-700">Invite invalid</p>
            <p className="mt-1 text-sm text-falcon-500">
              {error === 'expired'
                ? 'This invite has expired. Ask for a fresh one.'
                : error === 'already_accepted'
                ? 'This invite was already accepted.'
                : error === 'not_found'
                ? 'No invite found for this token.'
                : error}
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm text-falcon-500 hover:text-falcon-700"
            >
              ← Back to dashboard
            </Link>
          </div>
        )}

        {preview && (
          <>
            <p className="mt-6 text-sm text-falcon-500">
              <strong>{preview.inviterEmail}</strong> invited you to join the
            </p>
            <p className="mt-1 text-xl font-semibold text-falcon-700">
              {preview.workspaceName}
            </p>
            <p className="mt-3 text-xs text-falcon-500">
              Workspace owners can see metadata of every tracked email you send while you're a member — subject, recipient label, open / click counts, geo of opens. Your personal tracked sends stay your own.
            </p>
            <p className="mt-3 text-xs text-falcon-500">
              You'll see workspace-shared templates appear in your compose template picker right away.
            </p>
            {error && (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            )}
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              className="mt-5 w-full rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
            >
              {busy ? 'Accepting…' : 'Accept invite'}
            </button>
            <Link
              href="/dashboard"
              className="mt-3 block text-center text-xs text-falcon-500 hover:text-falcon-700"
            >
              Decline
            </Link>
          </>
        )}
      </div>
    </main>
  )
}

export default function AcceptPage() {
  return (
    <Suspense fallback={<main className="mx-auto mt-24 max-w-md px-6"><p className="text-sm">Loading…</p></main>}>
      <AcceptInner />
    </Suspense>
  )
}
