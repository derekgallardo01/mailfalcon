'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type EmailListItem,
  listEmails,
  logout as apiLogout,
} from '../../lib/api'
import { clearSession, getSession, type Session } from '../../lib/auth-store'

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function DashboardPage() {
  const router = useRouter()
  const [session, setSessionState] = useState<Session | null>(null)
  const [emails, setEmails] = useState<EmailListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) {
      router.replace('/sign-in')
      return
    }
    setSessionState(s)
    listEmails()
      .then((res) => setEmails(res.emails))
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

  async function handleLogout() {
    await apiLogout()
    clearSession()
    router.replace('/sign-in')
  }

  if (!session) return null

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-falcon-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-falcon-700">mailfalcon</h1>
          <p className="text-xs text-falcon-500">{session.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-falcon-500 hover:text-falcon-700"
        >
          Sign out
        </button>
      </header>

      <main className="mt-8">
        {loading && <p className="text-sm text-falcon-500">Loading…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && emails.length === 0 && (
          <div className="rounded border border-dashed border-falcon-200 p-12 text-center">
            <p className="text-sm text-falcon-500">No tracked emails yet.</p>
            <p className="mt-1 text-xs text-falcon-400">
              Open Gmail with the extension installed and send an email.
            </p>
          </div>
        )}
        {!loading && !error && emails.length > 0 && (
          <div className="overflow-hidden rounded border border-falcon-200">
            <table className="w-full text-sm">
              <thead className="bg-falcon-50 text-xs uppercase text-falcon-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Sent</th>
                  <th className="px-4 py-2 text-right font-medium">To</th>
                  <th className="px-4 py-2 text-right font-medium">Opens</th>
                  <th className="px-4 py-2 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2 text-right font-medium">Last event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-falcon-100">
                {emails.map((e) => (
                  <tr key={e.id} className="hover:bg-falcon-50">
                    <td className="px-4 py-3 text-falcon-700">
                      {formatRelative(e.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-700">
                      {e.recipientCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={e.openCount > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}>
                        {e.openCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={e.clickCount > 0 ? 'font-medium text-falcon-700' : 'text-falcon-400'}>
                        {e.clickCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-falcon-500">
                      {e.lastEventAt ? formatRelative(e.lastEventAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
