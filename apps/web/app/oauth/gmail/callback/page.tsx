'use client'

import { useEffect, useState } from 'react'
import { completeGmailComposeCallback } from '../../../../lib/api'
import { consumeVerifier } from '../../../../lib/google-oauth'

type State =
  | { kind: 'exchanging' }
  | { kind: 'ok'; email: string }
  | { kind: 'error'; message: string }

export default function GmailCallbackPage() {
  const [state, setState] = useState<State>({ kind: 'exchanging' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errParam = params.get('error')
    if (errParam) {
      setState({ kind: 'error', message: errParam })
      return
    }
    if (!code) {
      setState({ kind: 'error', message: 'no_code_in_callback' })
      return
    }
    const { verifier, redirectUri } = consumeVerifier()
    if (!verifier || !redirectUri) {
      setState({
        kind: 'error',
        message: 'lost_pkce_state — try connecting again from Settings',
      })
      return
    }
    void completeGmailComposeCallback({ code, codeVerifier: verifier, redirectUri })
      .then(({ googleEmail }) => {
        setState({ kind: 'ok', email: googleEmail })
        // Auto-close if we're in a popup; otherwise bounce back to Settings.
        if (window.opener) {
          try {
            window.opener.postMessage(
              { type: 'mf.gmail-connected', email: googleEmail },
              window.location.origin,
            )
          } catch {
            /* opener may be cross-origin — swallow */
          }
          window.close()
        } else {
          setTimeout(() => {
            window.location.assign('/settings/')
          }, 1200)
        }
      })
      .catch((err) => {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'callback_failed',
        })
      })
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      {state.kind === 'exchanging' && (
        <>
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-falcon-200 border-t-falcon-600" />
          <h1 className="text-lg font-semibold text-falcon-700">
            Connecting Gmail…
          </h1>
          <p className="mt-1 text-sm text-falcon-500">
            Exchanging tokens with Google.
          </p>
        </>
      )}
      {state.kind === 'ok' && (
        <>
          <div className="mb-4 text-4xl">✅</div>
          <h1 className="text-lg font-semibold text-falcon-700">
            Connected as {state.email}
          </h1>
          <p className="mt-1 text-sm text-falcon-500">
            {typeof window !== 'undefined' && window.opener
              ? 'You can close this tab.'
              : 'Redirecting to Settings…'}
          </p>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <div className="mb-4 text-4xl">⚠️</div>
          <h1 className="text-lg font-semibold text-falcon-700">
            Couldn&rsquo;t connect Gmail
          </h1>
          <p className="mt-2 max-w-sm break-words text-sm text-red-600">
            {state.message}
          </p>
          <a
            href="/settings/"
            className="mt-4 rounded bg-falcon-500 px-4 py-2 text-sm font-semibold text-white hover:bg-falcon-600"
          >
            Back to Settings
          </a>
        </>
      )}
    </main>
  )
}
