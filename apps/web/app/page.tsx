import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans">
      <Navbar />
      <Hero />
      <FeatureHighlight />
      <FeaturesGrid />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  )
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3 group">
          <img
            src="/icon.png"
            alt="Mail Falcon"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg shadow-sm transition-transform group-hover:scale-105"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Mail Falcon
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden sm:inline-flex rounded-lg px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/sign-in"
            className="hidden sm:inline-flex rounded-lg px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
          >
            Sign In
          </Link>
          <a
            href="https://chromewebstore.google.com/detail/mailfalcon/jbhhoinolhpcaghdlkndkmhlhofblnka"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-sm shadow-cyan-500/25 transition-all hover:bg-cyan-400 hover:shadow-cyan-500/40"
          >
            <span>⚡</span>
            Add to Chrome — Free
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
      {/* Background glow flares */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-cyan-600/15 via-blue-600/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-medium text-cyan-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Zero-Latency Email Intelligence for Gmail
          </div>

          <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.15]">
            Know the exact second your email is{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
              opened &amp; read.
            </span>
          </h1>

          <p className="mt-6 text-lg text-slate-300 leading-relaxed">
            Mail Falcon adds WhatsApp-style <strong>Double Blue Checkmarks (✓✓)</strong>, 
            instant desktop notifications, Apple MPP proxy filtering, and automated follow-up sequences 
            directly inside Gmail.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://chromewebstore.google.com/detail/mailfalcon/jbhhoinolhpcaghdlkndkmhlhofblnka"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400 hover:scale-[1.02]"
            >
              <span>⚡</span>
              Add to Chrome — It’s Free
            </a>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-sm transition-all hover:bg-slate-800 hover:text-white"
            >
              Open Web Dashboard →
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold">✓✓</span> Gmail Sent Indicators
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold">🛡️</span> Apple MPP Filter
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold">🌍</span> Live World Map
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold">🔁</span> Multi-Stage Sequences
            </span>
          </div>
        </div>

        {/* Hero Interactive Preview Mock */}
        <div className="relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-2 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-4">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-6">
            {/* Window bar */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-slate-400">Gmail · Sent Mail</span>
              </div>
              <span className="rounded-full bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                Mail Falcon v1.19 Active
              </span>
            </div>

            {/* Mock sent thread rows */}
            <div className="space-y-2 font-sans text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">Sarah Connor</span>
                  <span className="text-slate-300">Q3 Partnership Agreement &amp; Pricing Details</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-950 border border-blue-500/30 px-2.5 py-1 text-xs font-bold text-blue-300">
                    ✓✓ 4 opens · 1 click
                  </span>
                  <span className="text-xs text-slate-400">Just now</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">David Miller</span>
                  <span className="text-slate-300">Updated design prototypes &amp; brand assets</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-950 border border-blue-500/30 px-2.5 py-1 text-xs font-bold text-blue-300">
                    ✓✓ 2 opens
                  </span>
                  <span className="text-xs text-slate-400">12m ago</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-300">Elena Rostova</span>
                  <span className="text-slate-400">Quick sync on tomorrow roadmap schedule</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                    ✓ Sent
                  </span>
                  <span className="text-xs text-slate-400">1h ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureHighlight() {
  return (
    <section className="border-y border-slate-800/80 bg-slate-900/40 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400 text-lg font-bold">
              ✓✓
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Double Blue Checkmarks</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              WhatsApp and Telegram style indicators embedded right inside your Gmail Sent folders so you never have to guess.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400 text-lg">
              🛡️
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Apple MPP &amp; Bot Filtering</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Eliminates false open notifications caused by Apple Mail Privacy Protection, iCloud Private Relay, and datacenter bots.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400 text-lg">
              🔁
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Multi-Stage Follow-Ups</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Create automated drip sequences that pause immediately when your recipient replies.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesGrid() {
  const features = [
    {
      icon: '🌍',
      title: 'Live Real-Time World Map',
      body: 'Watch recipient engagement stream globally on an interactive world map powered by Server-Sent Events (SSE).',
    },
    {
      icon: '🔔',
      title: 'Interactive Desktop Alerts',
      body: 'Instant push notifications with deep links to email analytics and one-click thread muting.',
    },
    {
      icon: '📊',
      title: 'Send-Time Intelligence Heatmaps',
      body: '24×7 day and hour engagement matrix identifying exactly when your prospects are most active in their inbox.',
    },
    {
      icon: '🛡️',
      title: 'Pre-Flight Deliverability & Spam Score',
      body: 'Live scan for 60+ spam trigger phrases, punctuation density, link balance, and DNS SPF/DMARC health.',
    },
    {
      icon: '☁️',
      title: 'Browser-Closed Scheduled Sends',
      body: 'Cloud-backed queued dispatch via Gmail API ensures your scheduled emails send on time even if your computer is off.',
    },
    {
      icon: '🔒',
      title: 'Per-Email Privacy Mode',
      body: 'A single checkbox in Gmail lets you turn off tracking for any sensitive email with zero pixels or link rewrites.',
    },
  ]

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Everything you need to close more deals
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Engineered on Cloudflare serverless edge infrastructure with signed tracking IDs, per-email salts, and zero third-party telemetry.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 transition-all hover:border-slate-700 hover:bg-slate-900/70"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-3 text-base font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Install the Chrome Extension',
      body: 'Add Mail Falcon to Chrome in seconds. Log in with your Google account to enable tracking.',
    },
    {
      n: '2',
      title: 'Send Emails in Gmail as Usual',
      body: 'Write emails normally. Mail Falcon automatically attaches double blue checkmarks and tracking pixels.',
    },
    {
      n: '3',
      title: 'Get Real-Time Intelligence',
      body: 'Receive desktop push alerts, watch the live world map, and let automated sequences follow up for you.',
    },
  ]

  return (
    <section className="border-t border-slate-800/80 bg-slate-900/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Three steps from install to your first tracked open
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-sm font-bold text-slate-950">
                {s.n}
              </div>
              <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section className="border-t border-slate-800/80 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-base text-slate-400">
            Free forever for personal use. Upgrade to Pro or Team for unlimited tracking and advanced automation.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {/* Free Tier */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Free</h3>
            <p className="mt-3 text-4xl font-extrabold text-white">
              $0<span className="text-sm font-normal text-slate-400">/mo</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">
              <li>✓ 10 tracked emails per day</li>
              <li>✓ Double blue checkmarks in Gmail</li>
              <li>✓ Real-time desktop alerts</li>
              <li>✓ Apple MPP proxy filtering</li>
              <li>✓ No watermark or ads</li>
            </ul>
            <Link
              href="/sign-in"
              className="mt-8 block rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Start Free
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="relative flex flex-col rounded-2xl border-2 border-cyan-500 bg-slate-900/90 p-8 shadow-xl shadow-cyan-950/50 backdrop-blur-sm">
            <div className="absolute -top-3.5 right-6 rounded-full bg-cyan-500 px-3 py-0.5 text-xs font-bold text-slate-950 uppercase tracking-wide">
              Most Popular
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Pro</h3>
            <p className="mt-3 text-4xl font-extrabold text-white">
              $10<span className="text-sm font-normal text-slate-400">/mo</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-200">
              <li>✓ <strong>Unlimited</strong> tracked emails</li>
              <li>✓ Automated drip sequences</li>
              <li>✓ Send-time heatmap intelligence</li>
              <li>✓ Pre-flight spam score checker</li>
              <li>✓ Cloud scheduled sends</li>
              <li>✓ Daily morning email digest</li>
            </ul>
            <Link
              href="/sign-in"
              className="mt-8 block rounded-xl bg-cyan-500 px-4 py-2.5 text-center text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/25 transition-all hover:bg-cyan-400"
            >
              Get Pro
            </Link>
          </div>

          {/* Team Tier */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Team</h3>
            <p className="mt-3 text-4xl font-extrabold text-white">
              $25<span className="text-sm font-normal text-slate-400">/seat/mo</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">
              <li>✓ Everything in Pro</li>
              <li>✓ Shared team workspaces</li>
              <li>✓ Team engagement analytics</li>
              <li>✓ Shared sequence templates</li>
              <li>✓ Centralized billing &amp; seat management</li>
            </ul>
            <Link
              href="/sign-in"
              className="mt-8 block rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Start Team
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const items = [
    {
      q: 'Does the recipient see a badge or watermark?',
      a: 'No. Mail Falcon never adds visible watermarks, logos, or signatures to your emails. Your emails look 100% normal.',
    },
    {
      q: 'How does Apple Mail Privacy Protection (MPP) detection work?',
      a: 'Apple Mail pre-fetches email images via iCloud Private Relay servers. Mail Falcon recognizes these proxy pre-fetches, marks them separately, and prevents false desktop notifications so your stats reflect real human interactions.',
    },
    {
      q: 'What are the Double Blue Checkmarks (✓✓)?',
      a: 'Inside Gmail’s Sent folder, Mail Falcon shows real-time status chips on each thread: "✓ Sent" (gray), "✓✓ 3 opens" (electric blue), and "✓  Cached" (Apple proxy prefetch).',
    },
    {
      q: 'Do scheduled sends work if my browser is closed?',
      a: 'Yes! Pro and Team accounts support cloud-backed scheduled dispatch. Your emails are queued securely and dispatched on time via Gmail API regardless of your computer’s power state.',
    },
    {
      q: 'How do automated follow-up sequences work?',
      a: 'You can create multi-step drip campaigns. If a recipient hasn’t replied after your specified delay, Mail Falcon queues the next follow-up step and halts automatically when a reply is detected.',
    },
    {
      q: 'Where is my data stored?',
      a: 'All tracking and event data is encrypted and stored on Cloudflare D1 in the US region. We never sell, share, or monetize user data.',
    },
  ]

  return (
    <section className="border-t border-slate-800/80 bg-slate-900/30 py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-white">
          Frequently Asked Questions
        </h2>
        <dl className="mt-12 space-y-4">
          {items.map((it) => (
            <div
              key={it.q}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm"
            >
              <dt className="text-base font-bold text-white">{it.q}</dt>
              <dd className="mt-2 text-sm text-slate-300 leading-relaxed">{it.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-center text-sm text-slate-400">
          Need help or have questions?{' '}
          <a
            href="mailto:hello@mailfalcon.app"
            className="text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
          >
            hello@mailfalcon.app
          </a>
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-10 text-xs text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="" className="h-5 w-5 rounded" />
          <span className="font-semibold text-slate-400">Mail Falcon</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-300">Terms of Service</Link>
          <Link href="/refunds" className="hover:text-slate-300">Refunds</Link>
          <Link href="/dashboard" className="hover:text-slate-300">Dashboard</Link>
          <a href="mailto:hello@mailfalcon.app" className="hover:text-slate-300">Support</a>
        </div>
      </div>
    </footer>
  )
}
