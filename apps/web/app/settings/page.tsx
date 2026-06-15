'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type MeResponse,
  getMe,
  startCheckout,
  updateMe,
} from '../../lib/api'
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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-falcon-200 pb-4">
        <Link
          href="/dashboard"
          className="text-xs text-falcon-500 hover:text-falcon-700"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-falcon-700">Settings</h1>
        <p className="mt-1 text-xs text-falcon-500">{me.email}</p>
      </header>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-falcon-700">
          Email notifications
        </h2>
        <div className="mt-4 rounded border border-falcon-200 bg-white p-4">
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
        <div className="mt-4 rounded border border-falcon-200 bg-white p-4">
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
    </main>
  )
}
