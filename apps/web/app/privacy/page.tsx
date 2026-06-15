export const metadata = {
  title: 'Privacy policy — MailFalcon',
}

export default function PrivacyPage() {
  const lastUpdated = '2026-06-14'
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/" className="text-xs text-falcon-500 hover:text-falcon-700">
        ← MailFalcon
      </a>
      <h1 className="mt-2 text-2xl font-semibold text-falcon-700">Privacy policy</h1>
      <p className="mt-1 text-xs text-falcon-500">Last updated {lastUpdated}</p>

      <section className="prose mt-8 text-sm text-falcon-700">
        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          What MailFalcon does
        </h2>
        <p className="mt-2 leading-relaxed">
          MailFalcon is a Chrome extension and web dashboard that lets a sender
          (you) see when emails you've sent through Gmail are opened, and
          whether recipients click links inside them. It works by injecting a
          1×1 transparent image and rewriting outbound links to pass through
          our redirect server before reaching the destination.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Data we collect from you (the sender)
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>
            <strong>Email address.</strong> Used to sign you in via a one-time
            code and to identify your tracked emails.
          </li>
          <li>
            <strong>For each email you choose to track:</strong> a random
            tracking ID, the time you sent it, the number of recipients, and
            the original URLs of any links you included (so we can redirect
            recipients back to them).
          </li>
          <li>
            <strong>Billing information</strong> (Stripe customer ID,
            subscription tier) if you upgrade to a paid plan. Stripe processes
            payment details; we never see your card.
          </li>
        </ul>
        <p className="mt-3 leading-relaxed">
          We store the <strong>subject line</strong> of tracked emails so you
          and MailFalcon administrators can identify them in the dashboard.
          We do <strong>not</strong> store the body. We do not store your
          recipients' email addresses — only a count.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Data we collect when a recipient opens a tracked email or clicks a
          tracked link
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>The tracking ID of the email (lets us attribute back to you).</li>
          <li>Timestamp of the open or click.</li>
          <li>
            A coarse classification of the user agent (desktop / mobile / bot)
            — used to filter out automated security scanners and Gmail's own
            image proxy from your stats.
          </li>
          <li>
            Browser name and major version (e.g. "Chrome 130"), operating
            system name and version (e.g. "Windows 11"), and a coarse device
            descriptor where the user-agent string includes it (e.g.
            "iPhone").
          </li>
          <li>
            Coarse geolocation derived by Cloudflare from the recipient's IP
            address: country, region/state, city, postal code, and IANA
            timezone (e.g. "America/New_York"). When available, approximate
            latitude/longitude at IP-block resolution (city-level, not GPS).
          </li>
          <li>
            The recipient's IP address. We retain both a /24-truncated form
            (e.g.{' '}
            <code className="mx-1 rounded bg-falcon-50 px-1 py-0.5 font-mono text-xs">
              192.168.1.0
            </code>
            ) for aggregate statistics and the full IP for abuse
            investigation. The full IP is only accessible to MailFalcon
            administrators and is deleted on the standard retention schedule.
          </li>
        </ul>
        <p className="mt-3 leading-relaxed">
          We do <strong>not</strong> drop cookies on the recipient, do not
          fingerprint their device beyond the publicly-broadcast user-agent
          string, and do not share anything we collect with third-party
          advertising or analytics networks.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Privacy mode
        </h2>
        <p className="mt-2 leading-relaxed">
          Every Gmail compose window has a "Privacy mode" checkbox added by the
          MailFalcon extension. When checked, no pixel is injected, no links
          are rewritten, and no record of the send is created on our servers.
          That email is, from our perspective, completely untracked.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Email we send to you
        </h2>
        <p className="mt-2 leading-relaxed">
          We send one-time sign-in codes to your email address. If enabled
          (default on, toggle in <a href="/settings" className="text-falcon-500 underline hover:text-falcon-700">Settings</a>), we send a daily summary
          email at 6pm Eastern with that day's open/click counts and the
          subjects of your most-engaged emails. Days without activity are
          skipped. We do not include recipient addresses in the digest.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          How long we keep your data
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>
            <strong>Free plan:</strong> tracked-email history and event log
            retained for 30 days, then automatically purged.
          </li>
          <li>
            <strong>Pro plan:</strong> retained for 1 year.
          </li>
          <li>
            <strong>Account closure:</strong> all of your data is deleted
            within 30 days of you signing out and not signing back in, or
            immediately on explicit deletion request.
          </li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Where your data is stored
        </h2>
        <p className="mt-2 leading-relaxed">
          Cloudflare D1 (database) and Cloudflare KV (session + rate-limit
          cache), both edge-replicated, primary region in eastern North
          America. Push notification subscriptions are stored in D1 alongside
          your account; we deliver pushes via the browser's standard Web Push
          protocol (no third-party push service).
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Use of Google user data
        </h2>
        <p className="mt-2 leading-relaxed">
          The Chrome extension reads the body of a Gmail compose window only at
          the moment you click Send, and only to:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>insert a tracking pixel image at the end of the body, and</li>
          <li>
            rewrite outbound link URLs to pass through{' '}
            <code className="mx-1 rounded bg-falcon-50 px-1 py-0.5 font-mono text-xs">
              t.mailfalcon.app
            </code>
            .
          </li>
        </ul>
        <p className="mt-3 leading-relaxed">
          The modified body is then handed back to Gmail to send. The
          extension does not transmit your compose text, subject, recipient
          addresses, or any other Gmail content to our servers or to any
          third party. MailFalcon's use of information received from Google
          APIs adheres to Google's{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener"
            className="text-falcon-500 underline hover:text-falcon-700"
          >
            API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Your rights
        </h2>
        <p className="mt-2 leading-relaxed">
          You can sign in to your dashboard at any time to review every
          tracked email and event we've stored. Use the{' '}
          <a
            href="/settings"
            className="text-falcon-500 underline hover:text-falcon-700"
          >
            Settings page
          </a>{' '}
          to:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>
            <strong>Download your data</strong> — a JSON file with every row
            scoped to your account (user record, tracked emails, links, events,
            push subscriptions, templates, follow-ups, billing).
          </li>
          <li>
            <strong>Delete your account</strong> — sends a 6-digit
            confirmation code to your registered email; on confirm we
            permanently remove your user record and cascade-delete every
            associated row.
          </li>
        </ul>
        <p className="mt-2 leading-relaxed">
          Both actions are self-serve and complete within seconds. For
          anything else, email{' '}
          <a
            href="mailto:hello@mailfalcon.app"
            className="text-falcon-500 underline hover:text-falcon-700"
          >
            hello@mailfalcon.app
          </a>{' '}
          from the address registered to your account. We respond within 7
          days.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">
          Contact
        </h2>
        <p className="mt-2 leading-relaxed">
          For any privacy question, write to{' '}
          <a
            href="mailto:hello@mailfalcon.app"
            className="text-falcon-500 underline hover:text-falcon-700"
          >
            hello@mailfalcon.app
          </a>
          .
        </p>
      </section>
    </main>
  )
}
