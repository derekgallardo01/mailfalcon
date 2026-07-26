export const metadata = {
  title: 'Refund & Cancellation Policy — MailFalcon',
}

export default function RefundsPage() {
  const lastUpdated = '2026-07-25'
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/" className="text-xs text-falcon-500 hover:text-falcon-700">
        ← MailFalcon
      </a>
      <h1 className="mt-2 text-2xl font-semibold text-falcon-700">Refund &amp; Cancellation Policy</h1>
      <p className="mt-1 text-xs text-falcon-500">Last updated {lastUpdated}</p>

      <section className="prose mt-8 text-sm text-falcon-700">
        <p className="leading-relaxed">
          MailFalcon is operated by Kinetic Helix LLC. This policy explains how cancellations and refunds work for paid
          MailFalcon subscriptions.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Cancel anytime</h2>
        <p className="mt-2 leading-relaxed">
          You can cancel your subscription at any time from your account settings or by emailing{' '}
          <a href="mailto:hello@mailfalcon.app" className="text-falcon-600 underline hover:text-falcon-700">
            hello@mailfalcon.app
          </a>
          . When you cancel, your plan stays active through the end of the billing period you have already paid for, you
          keep Pro features until then, and your subscription does not renew — so you are not charged again.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">Refunds</h2>
        <p className="mt-2 leading-relaxed">
          Subscription fees are billed in advance and are non-refundable, including for partial billing periods after
          you cancel. We do not provide prorated refunds for the unused portion of a period.
        </p>
        <p className="mt-2 leading-relaxed">
          We may, at our discretion, issue a refund for a duplicate charge, a billing error on our side, or where
          required by law. If you were charged in error, contact us within 30 days and we will make it right.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">How to cancel</h2>
        <p className="mt-2 leading-relaxed">
          Open your billing settings in the MailFalcon dashboard, or email{' '}
          <a href="mailto:hello@mailfalcon.app" className="text-falcon-600 underline hover:text-falcon-700">
            hello@mailfalcon.app
          </a>{' '}
          from your account address and we will cancel it for you. See also our{' '}
          <a href="/terms" className="text-falcon-600 underline hover:text-falcon-700">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-falcon-600 underline hover:text-falcon-700">
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </main>
  )
}
