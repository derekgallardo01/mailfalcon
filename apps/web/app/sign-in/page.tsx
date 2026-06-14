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
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-falcon-700">Sign in</h1>
      <p className="mt-1 text-sm text-falcon-500">
        We'll email you a 6-digit code.
      </p>

      {stage === 'request' ? (
        <form onSubmit={onRequest} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-xs uppercase tracking-wide text-falcon-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded border border-falcon-200 bg-white px-3 py-2 text-sm focus:border-falcon-500 focus:outline-none"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={submitting || !email}
            className="rounded bg-falcon-500 px-3 py-2 text-sm font-medium text-white hover:bg-falcon-600 disabled:opacity-50"
          >
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="mt-8 flex flex-col gap-3">
          <p className="text-sm text-falcon-700">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
          <label htmlFor="code" className="text-xs uppercase tracking-wide text-falcon-500">
            Code
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
            className="rounded border border-falcon-200 bg-white px-3 py-2 text-lg tracking-widest focus:border-falcon-500 focus:outline-none"
            autoComplete="one-time-code"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStage('request')
                setCode('')
                setMsg({ kind: 'neutral', text: '' })
              }}
              className="rounded px-3 py-2 text-sm text-falcon-500 hover:bg-falcon-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="flex-1 rounded bg-falcon-500 px-3 py-2 text-sm font-medium text-white hover:bg-falcon-600 disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </form>
      )}

      {msg.text && (
        <p
          className={`mt-4 text-sm ${
            msg.kind === 'err'
              ? 'text-red-700'
              : msg.kind === 'ok'
                ? 'text-emerald-700'
                : 'text-falcon-500'
          }`}
        >
          {msg.text}
        </p>
      )}
    </main>
  )
}
