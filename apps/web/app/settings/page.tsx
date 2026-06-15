'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type MeResponse,
  confirmAccountDeletion,
  exportMe,
  getMe,
  requestAccountDeletion,
  startCheckout,
  updateMe,
} from '../../lib/api'
import { AppHeader } from '../../lib/AppHeader'
import { clearSession, getSession } from '../../lib/auth-store'

export default function SettingsPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getSession()) {
      router.replace('/sign-in')
      return
    }
    getMe()
      .then(setMe)
      .catch((err) => {
        if (err instanceof Error && err.message === 'unauthorized') {
          clearSession()
          router.replace('/sign-in')
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [router])

  const [exporting, setExporting] = useState(false)
  const [deleteStage, setDeleteStage] = useState<'idle' | 'awaiting-code' | 'deleting'>(
    'idle',
  )
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      await exportMe()
    } catch (err) {
      if (err instanceof Error && err.message === 'unauthorized') {
        clearSession()
        router.replace('/sign-in')
        return
      }
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteRequest() {
    if (!me) return
    if (
      !window.confirm(
        `We'll email a confirmation code to ${me.email}. Continue?`,
      )
    ) {
      return
    }
    setDeleteError(null)
    setError(null)
    try {
      await requestAccountDeletion()
      setDeleteStage('awaiting-code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    }
  }

  async function handleDeleteConfirm() {
    if (deleteCode.length !== 6) {
      setDeleteError('Enter the 6-digit code from your email.')
      return
    }
    setDeleteStage('deleting')
    setDeleteError(null)
    try {
      const result = await confirmAccountDeletion(deleteCode)
      // Account is gone — clear local session and bounce home.
      clearSession()
      const goodbye = result.stripeWarning
        ? `Account deleted. Heads up: ${result.stripeWarning}`
        : 'Account deleted.'
      window.alert(goodbye)
      router.replace('/')
    } catch (err) {
      setDeleteStage('awaiting-code')
      const code = err instanceof Error ? err.message : 'Delete failed'
      const human =
        code === 'wrong_code'
          ? 'Wrong code. Check your inbox and try again.'
          : code === 'expired_or_unknown'
            ? 'Code expired. Request a new one.'
            : code
      setDeleteError(human)
    }
  }

  async function toggleDigest(enabled: boolean) {
    if (!me) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const prev = me.digestEnabled
    setMe({ ...me, digestEnabled: enabled })
    try {
      await updateMe({ digestEnabled: enabled })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setMe({ ...me, digestEnabled: prev })
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !me) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <AppHeader />
        <p className="mt-6 text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <AppHeader />

      <div className="mt-6">
        <h1 className="text-xl font-semibold text-falcon-700">Settings</h1>
        <p className="mt-0.5 text-xs text-falcon-500">{me.email}</p>
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-falcon-700">
          Email notifications
        </h2>
        <div className="mt-4 rounded-lg border border-falcon-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-falcon-700">Daily digest</p>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                  Pro
                </span>
              </div>
              <p className="mt-1 text-sm text-falcon-500">
                A summary email at 6pm Eastern with your tracked-email
                activity from that day. Empty days are skipped.
              </p>
              {me.digestLastSentDay && me.tier !== 'free' && (
                <p className="mt-2 text-xs text-falcon-400">
                  Last sent: {me.digestLastSentDay}
                </p>
              )}
              {me.tier === 'free' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const url = await startCheckout()
                      window.location.assign(url)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Upgrade failed')
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded bg-falcon-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-falcon-600"
                >
                  Upgrade to Pro →
                </button>
              )}
            </div>
            {me.tier !== 'free' && (
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={me.digestEnabled}
                  onChange={(e) => void toggleDigest(e.target.checked)}
                  disabled={saving}
                  className="h-5 w-5 rounded border-falcon-300 text-falcon-500"
                />
                <span className="text-sm text-falcon-700">
                  {me.digestEnabled ? 'On' : 'Off'}
                </span>
              </label>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-falcon-700">Account</h2>
        <div className="mt-4 rounded-lg border border-falcon-200 bg-white p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-falcon-500">Email</dt>
              <dd className="text-falcon-700">{me.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-falcon-500">Plan</dt>
              <dd>
                <span className="rounded bg-falcon-100 px-2 py-0.5 text-xs font-medium text-falcon-700">
                  {me.tier}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-falcon-500">Today's usage</dt>
              <dd className="text-falcon-700">
                {me.usage.used} / {me.usage.limit} tracked emails
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-6 text-xs text-falcon-500">
        {saving && 'Saving…'}
        {saved && <span className="text-emerald-700">Saved ✓</span>}
        {error && <span className="text-red-700">{error}</span>}
      </div>

      <section className="mt-12">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <div className="mt-4 space-y-4 rounded-lg border border-red-200 bg-red-50/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-falcon-700">Download your data</p>
              <p className="mt-1 text-sm text-falcon-500">
                A JSON file with every row scoped to your account: user
                record, tracked emails, links, events, push subscriptions,
                templates, follow-ups, billing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="shrink-0 rounded border border-falcon-300 bg-white px-3 py-1.5 text-sm font-medium text-falcon-700 hover:bg-falcon-50 disabled:opacity-50"
            >
              {exporting ? 'Preparing…' : 'Download'}
            </button>
          </div>

          <div className="border-t border-red-200/60 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-red-700">Delete account</p>
                <p className="mt-1 text-sm text-falcon-500">
                  Permanently removes every tracked email, event, push
                  subscription, template, and your user record. We'll email
                  a 6-digit code to {me.email} to confirm. Cannot be undone.
                </p>
                {me.hasStripeCustomer && (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Heads up: cancel your Pro subscription in Stripe before
                    deleting, or contact us. We don't auto-cancel.
                  </p>
                )}
              </div>
              {deleteStage === 'idle' && (
                <button
                  type="button"
                  onClick={() => void handleDeleteRequest()}
                  className="shrink-0 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete…
                </button>
              )}
            </div>

            {deleteStage !== 'idle' && (
              <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-white p-3">
                <p className="text-sm text-falcon-700">
                  Check {me.email} for a 6-digit code and paste it below.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value.trim())}
                  placeholder="123456"
                  disabled={deleteStage === 'deleting'}
                  className="w-full rounded border border-falcon-200 px-3 py-2 text-lg tracking-widest focus:border-red-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteStage('idle')
                      setDeleteCode('')
                      setDeleteError(null)
                    }}
                    disabled={deleteStage === 'deleting'}
                    className="rounded px-3 py-1.5 text-sm text-falcon-500 hover:bg-falcon-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteConfirm()}
                    disabled={deleteStage === 'deleting' || deleteCode.length !== 6}
                    className="flex-1 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteStage === 'deleting'
                      ? 'Deleting…'
                      : 'Confirm — delete everything'}
                  </button>
                </div>
                {deleteError && (
                  <p className="text-xs text-red-700">{deleteError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
