'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { type Template, templates } from '../../lib/api'
import { AppHeader } from '../../lib/AppHeader'
import { clearSession, getSession } from '../../lib/auth-store'
import { formatRelative } from '../../lib/format'

export default function TemplatesPage() {
  const router = useRouter()
  const [list, setList] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [saving, setSaving] = useState(false)

  function refresh() {
    return templates
      .list()
      .then(setList)
      .catch((err) => {
        if (err instanceof Error) {
          if (err.message === 'unauthorized') {
            clearSession()
            router.replace('/sign-in')
            return
          }
          setError(err.message)
        }
      })
  }

  useEffect(() => {
    if (!getSession()) {
      router.replace('/sign-in')
      return
    }
    refresh().finally(() => setLoading(false))
  }, [router])

  function startNew() {
    setSelectedId(null)
    setName('')
    setSubject('')
    setBodyHtml('')
    setError(null)
  }

  function startEdit(t: Template) {
    setSelectedId(t.id)
    setName(t.name)
    setSubject(t.subject)
    setBodyHtml(t.bodyHtml)
    setError(null)
  }

  async function save() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (selectedId) {
        await templates.update(selectedId, { name, subject, bodyHtml })
      } else {
        const id = await templates.create({ name, subject, bodyHtml })
        setSelectedId(id)
      }
      await refresh()
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return
    try {
      await templates.remove(id)
      if (selectedId === id) startNew()
      await refresh()
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-6">
        <AppHeader />
        <p className="mt-6 text-sm text-falcon-500">Loading…</p>
      </main>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <AppHeader />

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-falcon-700">Templates</h1>
          <p className="text-xs text-falcon-500">
            Reusable subject + body. Pick one from compose to insert.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="rounded bg-falcon-500 px-4 py-2 text-sm font-medium text-white hover:bg-falcon-600"
        >
          New template
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-falcon-500">
            Your templates
          </h2>
          {list.length === 0 ? (
            <p className="rounded border border-dashed border-falcon-200 bg-white p-4 text-xs text-falcon-500">
              No templates yet. Click "New template" to create one.
            </p>
          ) : (
            <ul className="space-y-1">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className={`flex w-full flex-col items-start gap-0.5 rounded border px-3 py-2 text-left text-sm ${
                      selectedId === t.id
                        ? 'border-falcon-500 bg-falcon-50 text-falcon-700'
                        : 'border-falcon-200 bg-white text-falcon-700 hover:bg-falcon-50'
                    }`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-falcon-500">
                      {formatRelative(t.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-lg border border-falcon-200 bg-white p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-falcon-500">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales follow-up"
                className="mt-1 w-full rounded border border-falcon-200 px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-falcon-500">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Following up on our chat"
                className="mt-1 w-full rounded border border-falcon-200 px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-falcon-500">
                Body (HTML allowed)
              </label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="Hi {{name}}, just following up on…"
                rows={12}
                className="mt-1 w-full rounded border border-falcon-200 px-3 py-2 font-mono text-xs focus:border-falcon-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded bg-falcon-500 px-4 py-2 text-sm font-medium text-white hover:bg-falcon-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : selectedId ? 'Save changes' : 'Create'}
              </button>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => remove(selectedId)}
                  className="text-sm text-red-700 hover:text-red-900"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
