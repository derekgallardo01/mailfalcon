import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <FAQ />
    </main>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-falcon-50 to-white">
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full border border-falcon-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-falcon-500">
            Email tracking · Built for Gmail
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-falcon-700 sm:text-5xl">
            Know the moment your email is read.
          </h1>
          <p className="mt-5 text-lg text-falcon-500">
            MailFalcon adds open and link tracking to Gmail. Send like normal —
            get a notification the instant a recipient opens, with full
            browser, device and location detail.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-in"
              className="rounded bg-falcon-500 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-falcon-600"
            >
              Sign in to MailFalcon
            </Link>
            <Link
              href="/dashboard"
              className="rounded border border-falcon-200 bg-white px-5 py-3 text-sm font-medium text-falcon-700 hover:bg-falcon-50"
            >
              Open dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-falcon-400">
            Chrome extension currently in review · 10 tracked emails/day on
            Free, unlimited on Pro
          </p>
        </div>
      </div>
    </section>
  )
}

function Features() {
  const features = [
    {
      title: 'Real-time open tracking',
      body: 'See every open as it happens, with a Web Push notification on your desktop the instant a pixel fires.',
    },
    {
      title: 'Click tracking',
      body: 'Every link in your email is rewritten through a signed redirect so you know which links got clicked, when and from where.',
    },
    {
      title: 'Full device intelligence',
      body: 'Each open and click is enriched with browser, OS, device, IP, city, region, postal code and timezone.',
    },
    {
      title: 'Privacy mode per email',
      body: 'A checkbox in the Gmail compose area lets you skip tracking on any individual message — no pixel, no link rewrite.',
    },
    {
      title: 'Daily digest by email',
      body: 'Pro users get a morning recap of the prior day’s opens and clicks delivered to their inbox.',
    },
    {
      title: 'Bot filtering',
      body: 'Gmail’s image proxy and known prefetchers are flagged separately so you can trust the human-open count.',
    },
  ]
  return (
    <section className="border-t border-falcon-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-falcon-700">
          Everything you need to know who opened
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-falcon-500">
          MailFalcon runs end-to-end on Cloudflare with signed tracking IDs and
          per-email salts. No third-party analytics, no resold data.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-falcon-200 bg-falcon-50 p-6"
            >
              <h3 className="text-sm font-semibold text-falcon-700">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-falcon-500">{f.body}</p>
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
      title: 'Install the extension',
      body: 'Once approved on the Chrome Web Store, install MailFalcon and sign in. Until then it can be sideloaded — ask us for the build.',
    },
    {
      n: '2',
      title: 'Compose like usual',
      body: 'A “privacy mode” checkbox appears above the Gmail compose body. Leave it unchecked to track. Send when ready.',
    },
    {
      n: '3',
      title: 'Watch the dashboard',
      body: 'Opens and clicks stream in live at app.mailfalcon.app/dashboard. Get a notification toast the moment a recipient opens.',
    },
  ]
  return (
    <section className="border-t border-falcon-100 bg-falcon-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-falcon-700">
          Three steps from install to first open
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-lg border border-falcon-200 bg-white p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-falcon-500 text-sm font-semibold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-falcon-700">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-falcon-500">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section className="border-t border-falcon-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-falcon-700">
          Simple pricing
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-falcon-500">
          Free forever for hobby use. Upgrade when you outgrow it.
        </p>
        <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-falcon-200 bg-falcon-50 p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-falcon-500">
              Free
            </h3>
            <p className="mt-2 text-3xl font-semibold text-falcon-700">
              $0
              <span className="ml-1 text-sm font-normal text-falcon-500">
                / month
              </span>
            </p>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-falcon-600">
              <li>· 10 tracked emails per day</li>
              <li>· Real-time opens + clicks</li>
              <li>· Full device + location detail</li>
              <li>· No watermark on tracked emails</li>
            </ul>
            <Link
              href="/sign-in"
              className="mt-8 rounded border border-falcon-300 bg-white px-4 py-2 text-center text-sm font-medium text-falcon-700 hover:bg-falcon-100"
            >
              Start free
            </Link>
          </div>

          <div className="flex flex-col rounded-lg border-2 border-falcon-500 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-falcon-500">
                Pro
              </h3>
              <span className="rounded-full bg-falcon-100 px-2 py-0.5 text-xs font-medium text-falcon-700">
                Most popular
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-falcon-700">
              $7
              <span className="ml-1 text-sm font-normal text-falcon-500">
                / month
              </span>
            </p>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-falcon-600">
              <li>· Unlimited tracked emails</li>
              <li>· Everything in Free</li>
              <li>· Daily digest email</li>
              <li>· Cancel anytime from Settings</li>
            </ul>
            <Link
              href="/sign-in"
              className="mt-8 rounded bg-falcon-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-falcon-600"
            >
              Get Pro
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
      q: 'Does the recipient know they’re being tracked?',
      a: 'MailFalcon does not show a banner or watermark on outgoing email — it’s the same behavior as Mailtrack, HubSpot Sales, Streak and other Gmail trackers. If you’d rather a particular email not be tracked, tick the privacy-mode checkbox in the Gmail compose area before sending.',
    },
    {
      q: 'What about Gmail’s image proxy?',
      a: 'Gmail proxies inline images through its own servers, which can cause one early "prefetch" open. MailFalcon marks that bot-class open separately from human opens — the dashboard shows both numbers so you can trust the human count.',
    },
    {
      q: 'How does click tracking work?',
      a: 'Each link in your email is rewritten to a signed t.mailfalcon.app redirect that logs the click and forwards your recipient to the original URL within milliseconds. Links are scoped to the email so we can attribute the click correctly.',
    },
    {
      q: 'Can I disable tracking per email?',
      a: 'Yes. The privacy-mode checkbox sits in the Gmail compose area. Tick it to send without a tracking pixel or link rewrites for that single message — nothing is sent to MailFalcon.',
    },
    {
      q: 'What about my data?',
      a: 'Open + click events are stored on Cloudflare D1 in our US region. You can export everything as JSON or delete your account self-serve in Settings. See the privacy policy for full detail.',
    },
    {
      q: 'Outlook, Apple Mail, mobile?',
      a: 'MailFalcon is Gmail-only today (Chrome on desktop, via the extension). Outlook + mobile are on the post-launch roadmap.',
    },
  ]
  return (
    <section className="border-t border-falcon-100 bg-falcon-50">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-falcon-700">
          Questions
        </h2>
        <dl className="mt-12 space-y-6">
          {items.map((it) => (
            <div
              key={it.q}
              className="rounded-lg border border-falcon-200 bg-white p-6"
            >
              <dt className="text-sm font-semibold text-falcon-700">{it.q}</dt>
              <dd className="mt-2 text-sm text-falcon-500">{it.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-12 text-center text-sm text-falcon-500">
          Other questions?{' '}
          <a
            href="mailto:hello@mailfalcon.app"
            className="text-falcon-700 underline hover:text-falcon-600"
          >
            hello@mailfalcon.app
          </a>
        </p>
      </div>
    </section>
  )
}
