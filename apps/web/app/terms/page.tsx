export const metadata = {
  title: 'Terms of Service — MailFalcon',
}

export default function TermsPage() {
  const lastUpdated = '2026-07-25'
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/" className="text-xs text-falcon-500 hover:text-falcon-700">
        ← MailFalcon
      </a>
      <h1 className="mt-2 text-2xl font-semibold text-falcon-700">Terms of Service</h1>
      <p className="mt-1 text-xs text-falcon-500">Last updated {lastUpdated}</p>

      <section className="prose mt-8 text-sm text-falcon-700">
        <p className="leading-relaxed">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of MailFalcon, an email open- and click-tracking
          Chrome extension and web dashboard for Gmail. MailFalcon is operated by Kinetic Helix LLC (&ldquo;we,&rdquo;
          &ldquo;us&rdquo;), which is the provider and merchant of record for MailFalcon subscriptions. By creating an
          account or using MailFalcon, you agree to these Terms.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Accounts &amp; eligibility</h2>
        <p className="mt-2 leading-relaxed">
          You must be at least 18 and able to form a binding contract. You are responsible for activity under your
          account and for keeping your credentials secure.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Subscriptions &amp; billing</h2>
        <p className="mt-2 leading-relaxed">
          MailFalcon offers a free plan and paid plans billed on a recurring monthly basis through our payment
          processor, Stripe. Current prices are shown on our homepage. Paid subscriptions renew automatically at the
          then-current price until you cancel, and you authorize us to charge your payment method for each renewal.
          Prices are exclusive of any applicable taxes.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Cancellation &amp; refunds</h2>
        <p className="mt-2 leading-relaxed">
          You can cancel anytime; your plan remains active through the end of the period you have paid for and does not
          renew. See our{' '}
          <a href="/refunds" className="text-falcon-600 underline hover:text-falcon-700">
            Refund &amp; Cancellation Policy
          </a>{' '}
          for details.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Acceptable use</h2>
        <p className="mt-2 leading-relaxed">
          Use MailFalcon lawfully. Do not use it to send spam or unsolicited email, to harass or deceive recipients, to
          infringe others&rsquo; rights, or to attempt to disrupt or reverse-engineer the service. You are responsible
          for complying with laws that apply to tracking the emails you send.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Your data &amp; privacy</h2>
        <p className="mt-2 leading-relaxed">
          Our handling of your information is described in our{' '}
          <a href="/privacy" className="text-falcon-600 underline hover:text-falcon-700">
            Privacy Policy
          </a>
          . MailFalcon integrates with Gmail; your use of Google services is subject to Google&rsquo;s terms.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Disclaimers &amp; liability</h2>
        <p className="mt-2 leading-relaxed">
          MailFalcon is provided &ldquo;as is&rdquo; without warranties of any kind to the fullest extent permitted by
          law. To the maximum extent permitted by law, our total liability for any claim relating to the service is
          limited to the amount you paid us for it in the twelve months before the claim.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Changes &amp; contact</h2>
        <p className="mt-2 leading-relaxed">
          We may update these Terms from time to time; material changes will be reflected by the date above. Questions?
          Email{' '}
          <a href="mailto:hello@mailfalcon.app" className="text-falcon-600 underline hover:text-falcon-700">
            hello@mailfalcon.app
          </a>
          .
        </p>
      </section>
    </main>
  )
}
