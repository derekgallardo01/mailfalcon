'use client'

import Link from 'next/link'

export default function WelcomePage() {
  return (
    <main className="mx-auto mt-12 max-w-2xl px-6 pb-24">
      {/* Header Card */}
      <div className="rounded-2xl border border-falcon-200 bg-falcon-100 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/falcon.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg shadow-sm" />
          <div>
            <h1 className="text-2xl font-extrabold text-falcon-700 tracking-tight">Welcome to Mail Falcon!</h1>
            <p className="text-xs text-electric-cyan font-semibold uppercase tracking-wider">
              Extension Installed · Pro Trial Active
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-falcon-500 leading-relaxed">
          Mail Falcon is now active in your Chrome browser. Here are two quick steps to send your first tracked email:
        </p>

        {/* Step-by-Step Activation Cards */}
        <div className="mt-6 space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-4 rounded-xl border border-falcon-200 bg-falcon-50 p-4 transition-all hover:border-falcon-300">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric-cyan/20 text-electric-cyan font-bold text-sm">
              1
            </div>
            <div>
              <h2 className="text-sm font-bold text-falcon-700">Refresh your Gmail tab</h2>
              <p className="mt-1 text-xs text-falcon-500 leading-normal">
                If you already have Gmail open in another tab, press <kbd className="rounded bg-falcon-200 px-1.5 py-0.5 text-[11px] font-mono text-falcon-700">Ctrl+R</kbd> (or <kbd className="rounded bg-falcon-200 px-1.5 py-0.5 text-[11px] font-mono text-falcon-700">⌘+R</kbd>) to load the tracking engine.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 rounded-xl border border-falcon-200 bg-falcon-50 p-4 transition-all hover:border-falcon-300">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric-cyan/20 text-electric-cyan font-bold text-sm">
              2
            </div>
            <div>
              <h2 className="text-sm font-bold text-falcon-700">Click Compose & Look for the Mail Falcon Icon</h2>
              <p className="mt-1 text-xs text-falcon-500 leading-normal">
                Open a new compose window. You&apos;ll see the Mail Falcon icon right next to Gmail&apos;s Send button. Tracking is on by default!
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4 rounded-xl border border-falcon-200 bg-falcon-50 p-4 transition-all hover:border-falcon-300">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm">
              ✓
            </div>
            <div>
              <h2 className="text-sm font-bold text-falcon-700">Hit Send & Watch Live Opens</h2>
              <p className="mt-1 text-xs text-falcon-500 leading-normal">
                Send your email normally. You&apos;ll get instant desktop notifications the moment your recipient opens the email or clicks any link.
              </p>
            </div>
          </div>
        </div>

        {/* Visual Mock of Gmail Compose Window with Mail Falcon */}
        <div className="mt-6 rounded-xl border border-falcon-300/40 bg-slate-950/70 p-4 shadow-inner">
          <div className="text-[11px] font-semibold text-falcon-400 uppercase tracking-wider mb-2">
            Inside Your Gmail Compose Toolbar
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm">
                Send
              </span>
              <div className="relative flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-950/50 px-2.5 py-1 text-xs font-medium text-cyan-300 animate-pulse">
                <img src="/falcon.png" alt="" className="h-4 w-4 rounded" />
                <span>Tracking ON</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">
              ⚡ Real-time opens + link clicks
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto flex-1 text-center rounded-lg bg-electric-cyan px-5 py-3 text-sm font-bold text-falcon-50 shadow-lg shadow-cyan-950/50 hover:bg-electric-sky transition-colors"
          >
            Open Gmail Now →
          </a>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto rounded-lg border border-falcon-200 bg-falcon-50 px-5 py-3 text-center text-sm font-semibold text-falcon-600 hover:text-white hover:bg-falcon-200 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
