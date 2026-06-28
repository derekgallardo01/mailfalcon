'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type CustomDomainState,
  type EventWebhook,
  type MeResponse,
  type SubscriptionInfo,
  confirmAccountDeletion,
  createWebhook,
  deleteCustomDomain,
  deleteWebhook,
  exportMe,
  getCustomDomain,
  getMe,
  getSubscription,
  listWebhooks,
  openBillingPortal,
  patchWebhook,
  requestAccountDeletion,
  setCustomDomain,
  startCheckout,
  testWebhook,
  updateMe,
  verifyCustomDomain,
} from '../../lib/api'
import { config } from '../../lib/config'
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

      <QuietHoursSection me={me} setMe={setMe} setSaved={setSaved} setError={setError} />

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

      <SubscriptionPanel />

      <NotificationsPanel />

      <IntegrationsPanel />

      <CustomDomainPanel meTier={me?.tier ?? 'free'} />

      <ReportsPanel />

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

function minutesToHHMM(mins: number | null): string {
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function hhmmToMinutes(s: string): number | null {
  if (!s) return null
  const m = s.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  const h = Number.parseInt(m[1]!, 10)
  const mm = Number.parseInt(m[2]!, 10)
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

const COMMON_TZS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
]

function QuietHoursSection({
  me,
  setMe,
  setSaved,
  setError,
}: {
  me: MeResponse
  setMe: (m: MeResponse) => void
  setSaved: (b: boolean) => void
  setError: (s: string | null) => void
}) {
  const browserTz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC'
  const tzOptions = COMMON_TZS.includes(browserTz)
    ? COMMON_TZS
    : [browserTz, ...COMMON_TZS]

  const [start, setStart] = useState(minutesToHHMM(me.quietStartMinute))
  const [end, setEnd] = useState(minutesToHHMM(me.quietEndMinute))
  const [tz, setTz] = useState(me.quietTimezone ?? browserTz)
  const [saving, setSaving] = useState(false)

  const isOn = me.quietStartMinute != null && me.quietEndMinute != null

  async function save() {
    setSaving(true)
    setError(null)
    const startMin = hhmmToMinutes(start)
    const endMin = hhmmToMinutes(end)
    try {
      await updateMe({
        quietStartMinute: startMin,
        quietEndMinute: endMin,
        quietTimezone: startMin != null && endMin != null ? tz : null,
      })
      setMe({
        ...me,
        quietStartMinute: startMin,
        quietEndMinute: endMin,
        quietTimezone: startMin != null && endMin != null ? tz : null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function disable() {
    setStart('')
    setEnd('')
    setSaving(true)
    try {
      await updateMe({
        quietStartMinute: null,
        quietEndMinute: null,
        quietTimezone: null,
      })
      setMe({
        ...me,
        quietStartMinute: null,
        quietEndMinute: null,
        quietTimezone: null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-falcon-700">Quiet hours</h2>
      <div className="mt-4 rounded-lg border border-falcon-200 bg-white p-4">
        <p className="text-sm text-falcon-500">
          Skip push notifications during these hours. Events still record on
          your dashboard — we just won't ping you.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="font-medium uppercase tracking-wide text-falcon-500">
              From
            </span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded border border-falcon-200 px-2 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium uppercase tracking-wide text-falcon-500">
              To
            </span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded border border-falcon-200 px-2 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium uppercase tracking-wide text-falcon-500">
              Timezone
            </span>
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="mt-1 w-full rounded border border-falcon-200 bg-white px-2 py-1.5 text-sm focus:border-falcon-500 focus:outline-none"
            >
              {tzOptions.map((t) => (
                <option key={t} value={t}>
                  {t === browserTz ? `${t} (browser)` : t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-falcon-500 px-4 py-2 text-sm font-medium text-white hover:bg-falcon-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save quiet hours'}
          </button>
          {isOn && (
            <button
              type="button"
              onClick={disable}
              disabled={saving}
              className="text-sm text-falcon-500 hover:text-falcon-700 disabled:opacity-50"
            >
              Disable
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function SubscriptionPanel() {
  const [sub, setSub] = useState<SubscriptionInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getSubscription()
      .then(setSub)
      .catch(() => setSub(null))
  }, [])

  async function manage() {
    setBusy(true)
    try {
      const url = await openBillingPortal()
      window.location.assign(url)
    } catch {
      setBusy(false)
    }
  }

  async function upgrade(tier: 'pro' | 'team') {
    setBusy(true)
    try {
      const url = await startCheckout(tier)
      window.location.assign(url)
    } catch {
      setBusy(false)
    }
  }

  if (sub === undefined) return null

  if (!sub) {
    return (
      <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
        <h2 className="text-base font-semibold text-falcon-700">Subscription</h2>
        <p className="mt-1 text-sm text-falcon-500">
          You're on the free plan — 10 tracked emails per day, no digest, no
          mail-merge.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => upgrade('pro')}
            disabled={busy}
            className="rounded bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
          >
            Upgrade to Pro ($10/mo)
          </button>
          <button
            type="button"
            onClick={() => upgrade('team')}
            disabled={busy}
            className="rounded border border-falcon-300 bg-white px-4 py-2 text-sm font-semibold text-falcon-700 hover:bg-falcon-50 disabled:opacity-50"
          >
            Team ($25/mo)
          </button>
        </div>
      </section>
    )
  }

  const renewISO = new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
      <h2 className="text-base font-semibold text-falcon-700">Subscription</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-falcon-500">Plan</dt>
          <dd className="font-semibold capitalize text-falcon-700">{sub.tier}</dd>
        </div>
        <div>
          <dt className="text-falcon-500">Status</dt>
          <dd className="capitalize text-falcon-700">{sub.status}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-falcon-500">
            {sub.status === 'canceled' ? 'Ends' : 'Next renewal'}
          </dt>
          <dd className="text-falcon-700">{renewISO}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={manage}
        disabled={busy}
        className="mt-4 rounded border border-falcon-300 bg-white px-4 py-2 text-sm font-semibold text-falcon-700 hover:bg-falcon-50 disabled:opacity-50"
      >
        Manage billing in Stripe
      </button>
    </section>
  )
}

function NotificationsPanel() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void getMe().then(setMe).catch(() => undefined)
  }, [])
  async function toggle(field: 'middayDigestEnabled' | 'hotLeadAlertsEnabled') {
    if (!me) return
    const next = !me[field]
    setBusy(true)
    try {
      await updateMe({ [field]: next })
      setMe({ ...me, [field]: next })
    } finally {
      setBusy(false)
    }
  }
  if (!me) return null
  return (
    <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
      <h2 className="text-base font-semibold text-falcon-700">Notifications</h2>
      <p className="mt-1 text-xs text-falcon-500">
        Smart alerts on top of the existing real-time opens / clicks / replies push.
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={me.hotLeadAlertsEnabled}
            disabled={busy}
            onChange={() => toggle('hotLeadAlertsEnabled')}
            className="mt-1"
          />
          <div>
            <p className="font-medium text-falcon-700">Hot-lead alerts</p>
            <p className="text-[11px] text-falcon-500">
              Push when a contact crosses an engagement threshold — open burst, click after dormancy, or a reply right after sending. One alert per contact per 24h.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={me.middayDigestEnabled}
            disabled={busy}
            onChange={() => toggle('middayDigestEnabled')}
            className="mt-1"
          />
          <div>
            <p className="font-medium text-falcon-700">Mid-day digest email</p>
            <p className="text-[11px] text-falcon-500">
              1pm ET summary catching morning activity. The nightly digest still runs at 6pm.
            </p>
          </div>
        </label>
      </div>
    </section>
  )
}

function CustomDomainPanel({ meTier }: { meTier: string }) {
  const [state, setState] = useState<CustomDomainState | null>(null)
  const [hostInput, setHostInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const isPaid = meTier !== 'free'

  async function refresh() {
    try {
      setState(await getCustomDomain())
    } catch {
      setState(null)
    }
  }
  useEffect(() => {
    if (isPaid) void refresh()
  }, [isPaid])

  async function save() {
    if (!hostInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      const next = await setCustomDomain(hostInput.trim().toLowerCase())
      setState(next)
      setHostInput('')
      setInfo('DNS instructions generated — set them up, then click Verify.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save_failed')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setError(null)
    try {
      await verifyCustomDomain()
      await refresh()
      setInfo('Verified! Pixel + click URLs now use your domain.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'verify_failed')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect custom domain? Tracking reverts to t.mailfalcon.app.')) return
    setBusy(true)
    try {
      await deleteCustomDomain()
      await refresh()
      setInfo('Disconnected.')
    } finally {
      setBusy(false)
    }
  }

  if (!isPaid) {
    return (
      <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
        <h2 className="text-base font-semibold text-falcon-700">
          Custom tracking domain
        </h2>
        <p className="mt-2 text-sm text-falcon-500">
          Pro + Team only — serve the tracking pixel + click redirects from
          <code className="mx-1 rounded bg-falcon-50 px-1 py-0.5 font-mono text-xs">
            t.acmecorp.com
          </code>
          instead of t.mailfalcon.app. Hides MailFalcon branding from recipients.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign(`${config.apiHost}`)}
          disabled
          className="mt-3 cursor-not-allowed rounded bg-falcon-200 px-3 py-1.5 text-xs font-semibold text-falcon-500"
        >
          Upgrade to enable
        </button>
      </section>
    )
  }

  return (
    <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
      <h2 className="text-base font-semibold text-falcon-700">
        Custom tracking domain
      </h2>
      <p className="mt-1 text-xs text-falcon-500">
        Serve the pixel + click redirects from your own domain. Recipients see
        your brand instead of mailfalcon.app.
      </p>

      {!state?.host && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="mt-4 flex gap-2"
        >
          <input
            type="text"
            required
            placeholder="t.acmecorp.com"
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            className="flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add domain'}
          </button>
        </form>
      )}

      {state?.host && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            <strong>{state.host}</strong>{' '}
            {state.verifiedAt ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                verified
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                pending DNS
              </span>
            )}
          </p>
          {state.instructions && (
            <div className="rounded-md bg-falcon-50 p-3 text-xs">
              <p className="font-medium text-falcon-700">
                1. Add these DNS records:
              </p>
              <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-falcon-700">
                {`CNAME ${state.instructions.cname.name}  →  ${state.instructions.cname.target}
TXT   ${state.instructions.txt.name}  →  ${state.instructions.txt.value}`}
              </pre>
              <p className="mt-2 text-falcon-500">
                Note: your domain should be proxied through Cloudflare for HTTPS
                to work on the custom hostname.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {!state.verifiedAt && (
              <button
                type="button"
                onClick={verify}
                disabled={busy}
                className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify DNS'}
              </button>
            )}
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {info && <p className="mt-3 text-xs text-emerald-700">{info}</p>}
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    </section>
  )
}

function ReportsPanel() {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const [from, setFrom] = useState(thirtyDaysAgo)
  const [to, setTo] = useState(today)

  function url(format: 'html' | 'csv'): string {
    const fromTs = new Date(from).getTime()
    const toTs = new Date(to).getTime() + 86_400_000 // include the end day
    const qs = new URLSearchParams({
      from: String(fromTs),
      to: String(toTs),
      format,
    })
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('mf.token') : null
    if (token) qs.set('_token', token)
    return `${config.apiHost}/v1/me/report?${qs.toString()}`
  }

  async function download(format: 'html' | 'csv') {
    // Use fetch + blob so the Authorization header is honored — opening
    // the URL directly would skip the header.
    const res = await fetch(url(format), {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('mf.token') ?? ''}`,
      },
    })
    if (!res.ok) {
      alert(`Report failed: ${res.status}`)
      return
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    if (format === 'html') {
      window.open(objectUrl, '_blank')
    } else {
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `mailfalcon-report-${from}-${to}.csv`
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  return (
    <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
      <h2 className="text-base font-semibold text-falcon-700">Reports</h2>
      <p className="mt-1 text-xs text-falcon-500">
        Downloadable agency-friendly reports. The HTML version uses your
        company name + logo (set in Account) and is print-to-PDF ready.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-falcon-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-falcon-200 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-falcon-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-falcon-200 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void download('html')}
          className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600"
        >
          Open HTML report
        </button>
        <button
          type="button"
          onClick={() => void download('csv')}
          className="rounded-md border border-falcon-300 bg-white px-4 py-2 text-sm font-semibold text-falcon-700 hover:bg-falcon-50"
        >
          Download CSV
        </button>
      </div>
    </section>
  )
}

function IntegrationsPanel() {
  const [hooks, setHooks] = useState<EventWebhook[] | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setHooks(await listWebhooks())
    } catch {
      setHooks([])
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!url) return
    setBusy(true)
    setError(null)
    try {
      await createWebhook({ url })
      setUrl('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_failed')
    } finally {
      setBusy(false)
    }
  }

  async function toggleField(
    h: EventWebhook,
    field: 'enabled' | 'notifyOpen' | 'notifyClick' | 'notifyReply' | 'notifyHotLead',
  ) {
    try {
      await patchWebhook(h.id, { [field]: !h[field] })
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'patch_failed')
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this webhook?')) return
    try {
      await deleteWebhook(id)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'delete_failed')
    }
  }

  async function test(id: string) {
    try {
      await testWebhook(id)
      alert('Test fired — check your channel.')
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'test_failed')
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-falcon-200 bg-white p-5">
      <h2 className="text-base font-semibold text-falcon-700">Integrations</h2>
      <p className="mt-1 text-xs text-falcon-500">
        Slack and Discord webhooks — events fire to your channel in real time.
      </p>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className="flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add webhook'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <p className="mt-2 text-[11px] text-falcon-500">
        Get a Slack incoming-webhook URL from your workspace's <em>Apps</em> page; Discord URLs come from a channel's Edit → Integrations → Webhooks.
      </p>
      {hooks && hooks.length > 0 && (
        <div className="mt-4 space-y-3">
          {hooks.map((h) => (
            <div key={h.id} className="rounded border border-falcon-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[11px] text-falcon-600" title={h.url}>
                  {h.url}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => test(h.id)}
                    className="text-xs text-falcon-500 hover:text-falcon-700"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(h.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                {([
                  ['enabled', 'enabled'],
                  ['notifyOpen', 'opens'],
                  ['notifyClick', 'clicks'],
                  ['notifyReply', 'replies'],
                  ['notifyHotLead', 'hot leads'],
                ] as const).map(([f, label]) => (
                  <label key={f} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={h[f]}
                      onChange={() => toggleField(h, f)}
                    />
                    <span className="capitalize text-falcon-600">{label}</span>
                  </label>
                ))}
              </div>
              {h.lastFiredAt && (
                <p className="mt-2 text-[10px] text-falcon-400">
                  Last fired {new Date(h.lastFiredAt).toLocaleString()} · status {h.lastStatus ?? '—'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
