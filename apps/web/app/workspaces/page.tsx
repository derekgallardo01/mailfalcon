'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  type MeResponse,
  type WorkspaceInviteListItem,
  type WorkspaceMember,
  createWorkspace,
  deleteWorkspace,
  getMe,
  inviteToWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMember,
  renameWorkspace,
} from '../../lib/api'
import { AppHeader } from '../../lib/AppHeader'

export default function WorkspacesPage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [pending, setPending] = useState<WorkspaceInviteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [renameInput, setRenameInput] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const m = await getMe()
      setMe(m)
      setRenameInput(m.activeWorkspaceName)
      const det = await listWorkspaceMembers(m.activeWorkspaceId)
      setMembers(det.members)
      setPending(det.pendingInvites)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading || !me) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-6">
        <AppHeader />
        <main className="mt-6">
          <p className="text-sm text-falcon-500">Loading…</p>
        </main>
      </div>
    )
  }

  const isOwner = me.activeWorkspaceRole === 'owner'
  const activeWs = me.workspaces.find((w) => w.id === me.activeWorkspaceId)
  const isPersonal = activeWs?.isPersonal ?? false

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !me) return
    setInviteBusy(true)
    try {
      await inviteToWorkspace(me.activeWorkspaceId, inviteEmail.trim().toLowerCase())
      setInviteEmail('')
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'invite_failed')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleRemove(memberId: string) {
    if (!me) return
    if (!confirm('Remove this member?')) return
    try {
      await removeWorkspaceMember(me.activeWorkspaceId, memberId)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'remove_failed')
    }
  }

  async function handleLeave() {
    if (!me) return
    if (!confirm(`Leave "${me.activeWorkspaceName}"? You'll lose access to its templates.`)) return
    try {
      await removeWorkspaceMember(me.activeWorkspaceId, me.id)
      window.location.reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'leave_failed')
    }
  }

  async function handleRename() {
    if (!me || renameInput.trim() === me.activeWorkspaceName) return
    try {
      await renameWorkspace(me.activeWorkspaceId, renameInput.trim())
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'rename_failed')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newWsName.trim()) return
    try {
      await createWorkspace(newWsName.trim())
      setNewWsName('')
      window.location.reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'create_failed')
    }
  }

  async function handleDelete() {
    if (!me) return
    if (!confirm(`Delete "${me.activeWorkspaceName}" forever? All shared templates will be lost.`)) return
    try {
      await deleteWorkspace(me.activeWorkspaceId)
      window.location.reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'delete_failed')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <AppHeader />

      <main className="mt-6 space-y-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-lg border border-falcon-200 bg-white p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
            Active workspace
          </p>
          {isOwner && !isPersonal ? (
            <div className="mt-2 flex gap-2">
              <input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onBlur={handleRename}
                className="flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-lg font-semibold text-falcon-700"
              />
            </div>
          ) : (
            <p className="mt-1 text-2xl font-semibold text-falcon-700">
              {me.activeWorkspaceName}
              {isPersonal && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  personal
                </span>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-falcon-400">
            Role: {me.activeWorkspaceRole} · {members.length} member{members.length === 1 ? '' : 's'}
          </p>
        </section>

        {isOwner && !isPersonal && (
          <section className="rounded-lg border border-falcon-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
              Invite a member
            </p>
            <form onSubmit={handleInvite} className="mt-3 flex gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={inviteBusy}
                className="rounded-md bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600 disabled:opacity-50"
              >
                {inviteBusy ? 'Sending…' : 'Send invite'}
              </button>
            </form>
            <p className="mt-2 text-xs text-falcon-400">
              They'll get a one-time link valid for 7 days. They keep their own personal tracked emails private; you'll only see the team rollup.
            </p>
          </section>
        )}

        <section className="rounded-lg border border-falcon-200 bg-white p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
            Members
          </p>
          <ul className="mt-3 divide-y divide-falcon-100">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-falcon-700">{m.email}</p>
                  <p className="text-xs text-falcon-400 capitalize">{m.role}</p>
                </div>
                {isOwner && m.userId !== me.id && !isPersonal && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m.userId)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
                {!isOwner && m.userId === me.id && !isPersonal && (
                  <button
                    type="button"
                    onClick={handleLeave}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Leave
                  </button>
                )}
              </li>
            ))}
          </ul>
          {pending.length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-medium uppercase tracking-wide text-falcon-500">
                Pending invites
              </p>
              <ul className="mt-2 divide-y divide-falcon-100">
                {pending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-falcon-700">{p.email}</span>
                    <span className="text-xs text-falcon-400">
                      expires {new Date(p.expiresAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-falcon-200 bg-white p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-falcon-500">
            Create a new workspace
          </p>
          <form onSubmit={handleCreate} className="mt-3 flex gap-2">
            <input
              required
              maxLength={60}
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Acme Co"
              className="flex-1 rounded-md border border-falcon-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-falcon-300 bg-white px-4 py-2 text-sm font-semibold text-falcon-700 hover:bg-falcon-50"
            >
              Create
            </button>
          </form>
        </section>

        {isOwner && !isPersonal && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
              Danger zone
            </p>
            <p className="mt-1 text-sm text-red-800">
              Deleting <strong>{me.activeWorkspaceName}</strong> removes every member and every shared template. This can't be undone.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              className="mt-3 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Delete workspace
            </button>
          </section>
        )}

        <Link
          href="/dashboard"
          className="inline-block text-sm text-falcon-500 hover:text-falcon-700"
        >
          ← Back to dashboard
        </Link>
      </main>
    </div>
  )
}
