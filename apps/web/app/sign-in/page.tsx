'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { requestCode, verifyCode } from '../../lib/api'
import { setSession } from '../../lib/auth-store'

function humanize(code: string): string {
  switch (code) {
    case 'wrong_code':
      return 'Wrong code. Try again.'
    case 'too_many_attempts':
      return 'Too many attempts. Request a new code.'
    case 'expired_or_unknown':
      return 'Code expired. Request a new one.'
    default:
      return code
  }
}

export default function SignInPage() {
  const router = useRouter()
  const [stage, setStage] = useState<'request' | 'verify'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok' | 'neutral'; text: string }>({
    kind: 'neutral',
    text: '',
  })
  const [submitting, setSubmitting] = useState(false)

  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMsg({ kind: 'neutral', text: 'Sending…' })
    try {
      await requestCode(email)
      setStage('verify')
      setMsg({ kind: 'ok', text: 'Code sent. Check your email.' })
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMsg({ kind: 'neutral', text: 'Verifying…' })
    try {
      const result = await verifyCode(email, code)
      setSession({ token: result.token, email: result.email, userId: result.userId })
      router.push('/dashboard')
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Verify failed'
      setMsg({ kind: 'err', text: humanize(text) })
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <div className="rounded-2xl border border-falcon-200 bg-falcon-100 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-6">
          <img
            src="/icon.png"
            alt="Mail Falcon"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl shadow-sm"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Sign in</h1>
            <p className="text-xs text-falcon-400">
              Real-time email tracking for Gmail
            </p>
          </div>
        </div>

        {stage === 'request' ? (
          <form onSubmit={onRequest} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-falcon-400 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-falcon-200 bg-falcon-50 px-3.5 py-2.5 text-sm text-white placeholder-falcon-400 focus:border-electric-cyan focus:outline-none transition-colors"
                autoComplete="email"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !email}
              className="mt-2 w-full rounded-lg bg-electric-cyan px-4 py-2.5 text-sm font-bold text-falcon-50 shadow-md hover:bg-electric-sky disabled:opacity-50 transition-all"
            >
              {submitting ? 'Sending code…' : 'Send verification code →'}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            <div className="rounded-lg border border-falcon-200 bg-falcon-50 p-3 text-xs text-falcon-400">
              We sent a 6-digit code to <strong className="text-white font-medium">{email}</strong>
            </div>
            <div>
              <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-falcon-400 mb-1.5">
                6-Digit Code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border border-falcon-200 bg-falcon-50 px-3.5 py-2.5 text-center font-mono text-2xl font-bold tracking-[0.25em] text-cyan-400 focus:border-electric-cyan focus:outline-none transition-colors"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStage('request')
                  setCode('')
                  setMsg({ kind: 'neutral', text: '' })
                }}
                className="rounded-lg border border-falcon-200 bg-falcon-50 px-4 py-2.5 text-xs font-medium text-falcon-400 hover:text-white hover:bg-falcon-200 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="flex-1 rounded-lg bg-electric-cyan px-4 py-2.5 text-sm font-bold text-falcon-50 shadow-md hover:bg-electric-sky disabled:opacity-50 transition-all"
              >
                {submitting ? 'Verifying…' : 'Verify & Sign in →'}
              </button>
            </div>
          </form>
        )}

        {msg.text && (
          <div
            className={`mt-4 rounded-lg p-2.5 text-center text-xs font-medium ${
              msg.kind === 'err'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                : msg.kind === 'ok'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                  : 'bg-falcon-50 text-falcon-400 border border-falcon-200'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </main>
  )
}
