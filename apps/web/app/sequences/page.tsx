'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppHeader } from '../../lib/AppHeader'
import { clearSession, getSession, type Session } from '../../lib/auth-store'
import { config } from '../../lib/config'
import { getMe, type MeResponse } from '../../lib/api'

interface SequenceStep {
  id?: string
  stepNumber: number
  delayDays: number
  condition: 'no_reply' | 'no_open' | 'always'
  subject: string
  bodyHtml: string
}

interface Sequence {
  id: string
  name: string
  status: 'active' | 'paused' | 'archived'
  createdAt: number
  steps: SequenceStep[]
  activeEnrollments: number
}

export default function SequencesPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEnrollModal, setShowEnrollModal] = useState<string | null>(null)

  // New sequence form state
  const [newSeqName, setNewSeqName] = useState('')
  const [newSteps, setNewSteps] = useState<SequenceStep[]>([
    {
      stepNumber: 1,
      delayDays: 3,
      condition: 'no_reply',
      subject: 'Following up on our conversation',
      bodyHtml: 'Hi {{first_name}},\n\nJust wanted to quickly check in and see if you had a chance to review my previous email?\n\nBest regards,',
    },
    {
      stepNumber: 2,
      delayDays: 5,
      condition: 'no_reply',
      subject: 'Quick question regarding your team',
      bodyHtml: 'Hi {{first_name}},\n\nI know things get busy! Thought I would follow up one last time to see if this is on your radar.\n\nThanks!',
    },
  ])

  // Enroll form state
  const [enrollEmail, setEnrollEmail] = useState('')

  useEffect(() => {
    async function init() {
      const s = await getSession()
      setSession(s)
      if (s) {
        void getMe().then(setMe).catch(() => {})
        await loadSequences(s.token)
      }
      setLoading(false)
    }
    void init()
  }, [])

  async function loadSequences(token: string) {
    try {
      const res = await fetch(`${config.apiHost}/v1/sequences`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setSequences(json.sequences || [])
      }
    } catch (err) {
      console.error('Failed to load sequences:', err)
    }
  }

  async function handleCreateSequence(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !newSeqName.trim()) return

    try {
      const res = await fetch(`${config.apiHost}/v1/sequences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newSeqName,
          steps: newSteps,
        }),
      })

      if (res.ok) {
        setShowCreateModal(false)
        setNewSeqName('')
        await loadSequences(session.token)
      }
    } catch (err) {
      console.error('Create sequence error:', err)
    }
  }

  async function handleEnrollContact(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !showEnrollModal || !enrollEmail.trim()) return

    try {
      const res = await fetch(`${config.apiHost}/v1/sequences/${showEnrollModal}/enroll`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientEmail: enrollEmail }),
      })

      if (res.ok) {
        setShowEnrollModal(null)
        setEnrollEmail('')
        await loadSequences(session.token)
      }
    } catch (err) {
      console.error('Enroll contact error:', err)
    }
  }

  async function handleDeleteSequence(id: string) {
    if (!session || !confirm('Delete this automated sequence?')) return
    try {
      const res = await fetch(`${config.apiHost}/v1/sequences/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      })
      if (res.ok) {
        await loadSequences(session.token)
      }
    } catch (err) {
      console.error('Delete sequence error:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] text-slate-100 flex items-center justify-center">
        Loading automated sequences...
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Sign in required</h2>
        <p className="text-slate-400 mb-4">Please sign in to manage automated follow-up sequences.</p>
        <Link href="/sign-in" className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold">
          Go to Sign In
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 font-sans">
      <AppHeader />

      <main className="mt-6">
        {/* Page Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Automated Drip Sequences</h1>
            <p className="text-sm text-slate-400">
              Multi-stage follow-up workflows that automatically pause when recipients reply.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110"
          >
            <span>+ Create Sequence</span>
          </button>
        </div>

        {/* Sequence List */}
        {sequences.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#0f172a]/60 p-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 text-xl font-bold">
              ⚡
            </div>
            <h3 className="text-base font-semibold text-white">No Automated Sequences Yet</h3>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Set up multi-stage follow-up emails that automatically trigger if a prospect hasn't replied within a few days.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
            >
              Build your first sequence
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {sequences.map((seq) => (
              <div
                key={seq.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]/80 p-6 shadow-xl transition-all hover:border-slate-700"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{seq.name}</h3>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                        {seq.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {seq.steps.length} sequential step{seq.steps.length === 1 ? '' : 's'} · {seq.activeEnrollments} active contact{seq.activeEnrollments === 1 ? '' : 's'} enrolled
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEnrollModal(seq.id)}
                      className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                    >
                      + Enroll Contact
                    </button>
                    <button
                      onClick={() => handleDeleteSequence(seq.id)}
                      className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Steps Visualizer */}
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-4">
                  {seq.steps.map((st, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-3 text-xs">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <span className="font-semibold text-cyan-400">Step {st.stepNumber}</span>
                          <span>·</span>
                          <span>Wait {st.delayDays}d</span>
                          <span>·</span>
                          <span className="text-slate-300 font-mono text-[10px] uppercase">
                            {st.condition.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="font-medium text-slate-200 truncate max-w-[200px]">
                          {st.subject}
                        </div>
                      </div>
                      {i < seq.steps.length - 1 && (
                        <span className="text-slate-600 font-bold">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-4">Create Automated Sequence</h2>
              <form onSubmit={handleCreateSequence} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sequence Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Inbound Sales Demo Follow-up"
                    value={newSeqName}
                    onChange={(e) => setNewSeqName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                {/* Steps */}
                <div className="space-y-3">
                  <span className="block text-xs font-semibold text-slate-300">Sequence Steps</span>
                  {newSteps.map((step, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-cyan-400">
                        <span>Step {step.stepNumber}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Delay (Days after previous)</label>
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={step.delayDays}
                            onChange={(e) => {
                              const copy = [...newSteps]
                              copy[idx]!.delayDays = Number(e.target.value)
                              setNewSteps(copy)
                            }}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Condition</label>
                          <select
                            value={step.condition}
                            onChange={(e) => {
                              const copy = [...newSteps]
                              copy[idx]!.condition = e.target.value as any
                              setNewSteps(copy)
                            }}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                          >
                            <option value="no_reply">If no reply received</option>
                            <option value="no_open">If not opened</option>
                            <option value="always">Always send</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Subject</label>
                        <input
                          type="text"
                          required
                          value={step.subject}
                          onChange={(e) => {
                            const copy = [...newSteps]
                            copy[idx]!.subject = e.target.value
                            setNewSteps(copy)
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Body Text / HTML</label>
                        <textarea
                          rows={3}
                          value={step.bodyHtml}
                          onChange={(e) => {
                            const copy = [...newSteps]
                            copy[idx]!.bodyHtml = e.target.value
                            setNewSteps(copy)
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    Save Sequence
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Enroll Modal */}
        {showEnrollModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-2">Enroll Contact in Sequence</h2>
              <p className="text-xs text-slate-400 mb-4">
                Enter the prospect email address. Follow-up emails will execute on schedule unless they reply.
              </p>
              <form onSubmit={handleEnrollContact} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Recipient Email</label>
                  <input
                    type="email"
                    required
                    placeholder="prospect@company.com"
                    value={enrollEmail}
                    onChange={(e) => setEnrollEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(null)}
                    className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    Start Sequence
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
