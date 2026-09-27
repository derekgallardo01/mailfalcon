import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — Mail Falcon',
}

export default function TermsPage() {
  const lastUpdated = 'September 27, 2026'
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-xs text-falcon-500 hover:text-falcon-700">
        ← Mail Falcon
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-falcon-700">Terms of Service</h1>
      <p className="mt-1 text-xs text-falcon-500">Last updated {lastUpdated}</p>

      <section className="prose mt-8 text-sm text-falcon-700 space-y-5">
        <p className="leading-relaxed">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Mail Falcon, an email open- and click-tracking
          Chrome extension, web dashboard, and API for Gmail. Mail Falcon is owned and operated by Kinetic Helix LLC, a Florida
          limited liability company (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;), which is the provider and merchant of
          record for Mail Falcon subscriptions. By creating an account, installing the extension, or using Mail Falcon, you agree to these Terms.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">1. Accounts &amp; eligibility</h2>
        <p className="leading-relaxed">
          You must be at least 18 years of age and legally capable of forming a binding contract. You are responsible for maintaining
          the security of your account and credentials and for all activities conducted under your account.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">2. Subscriptions &amp; recurring billing</h2>
        <p className="leading-relaxed">
          Mail Falcon offers free and paid subscription plans billed on a recurring monthly or annual basis through our payment
          processor, Stripe. Paid subscriptions renew automatically at the then-current price until you cancel, and you authorize us
          to charge your payment method on file for each renewal. Prices are exclusive of applicable taxes.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">3. Cancellation &amp; refunds</h2>
        <p className="leading-relaxed">
          You can cancel your subscription at any time from your account settings; your plan remains active through the end of the billing
          period you have paid for and will not renew. See our{' '}
          <Link href="/refunds" className="text-falcon-600 underline hover:text-falcon-700">
            Refund &amp; Cancellation Policy
          </Link>{' '}
          for complete terms.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">4. Commercial email marketing warranties &amp; anti-spam compliance</h2>
        <p className="leading-relaxed">
          Mail Falcon is designed strictly for legitimate business, transactional, and permitted marketing communications. By using Mail Falcon, you expressly represent, warrant, and covenant that:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Anti-Spam Compliance:</strong> All emails you send using or tracked by Mail Falcon comply strictly with the US CAN-SPAM Act (15 U.S.C. &sect; 7701 et seq.), Canada&apos;s Anti-Spam Legislation (CASL), the European Union General Data Protection Regulation (GDPR), the UK Data Protection Act, and all applicable international anti-spam laws.
          </li>
          <li>
            <strong>Consent &amp; Authorization:</strong> You have obtained all legally required consents, permissions, or opt-ins from every recipient prior to sending emails and prior to embedding tracking pixels or tracking links.
          </li>
          <li>
            <strong>No Scraped or Harvested Lists:</strong> You will not use Mail Falcon in connection with purchased, rented, scraped, or harvested email lists, or lists obtained through automated directory harvesting.
          </li>
          <li>
            <strong>Truthful Headers &amp; Unsubscribe:</strong> Every commercial marketing email must clearly identify the sender, include a valid physical postal address, contain non-deceptive subject lines, and include a functioning opt-out or unsubscribe mechanism.
          </li>
          <li>
            <strong>Complete Indemnification:</strong> You agree to defend, indemnify, and hold harmless Kinetic Helix LLC, its owners, and its affiliates from and against any fines, regulatory penalties, damages, carrier blocklisting costs, or legal fees resulting from your violation of anti-spam laws.
          </li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">5. Acceptable use &amp; email tracking ethics</h2>
        <p className="leading-relaxed">
          You agree to use Mail Falcon ethically and lawfully. You shall not use Mail Falcon to stalk, harass, defame, or deceive individuals;
          infringe third-party intellectual property or privacy rights; transmit malware or phishing payloads; or attempt to reverse-engineer,
          decompile, or disrupt our backend infrastructure or APIs.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">6. Third-party integrations &amp; Gmail</h2>
        <p className="leading-relaxed">
          Mail Falcon integrates with Google Workspace and Gmail APIs. Your use of Google services is governed by Google&apos;s Terms of Service
          and Privacy Policy. We are not responsible for modifications, restrictions, or deprecations imposed by Google on their extension ecosystem.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">7. Founder &amp; member shield — no personal recourse</h2>
        <p className="leading-relaxed font-semibold">
          YOU EXPRESSLY AGREE THAT YOUR SOLE AND EXCLUSIVE RECOURSE AND REMEDY FOR ANY CLAIM, CONTROVERSY, INJURY, BREACH, OR LIABILITY
          ARISING OUT OF OR RELATING TO MAIL FALCON, THESE TERMS, OR KINETIC HELIX LLC IS STRICTLY AGAINST KINETIC HELIX LLC, A FLORIDA LIMITED
          LIABILITY COMPANY. YOU UNCONDITIONALLY AND FOREVER WAIVE, RELEASE, AND FORFEIT ANY RIGHT TO COMMENCE LAWSUITS, ASSERT CLAIMS, OR SEEK
          PERSONAL MONETARY OR EQUITABLE LIABILITY AGAINST DEREK GALLARDO OR ANY INDIVIDUAL FOUNDER, MEMBER, MANAGER, OFFICER, EMPLOYEE,
          CONTRACTOR, OR AGENT OF KINETIC HELIX LLC.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">8. Disclaimers of warranties &amp; damage cap</h2>
        <p className="leading-relaxed">
          MAIL FALCON IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY.
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL KINETIC HELIX LLC OR ITS FOUNDERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, DELIVERABILITY, OR BUSINESS REPUTATION. OUR TOTAL AGGREGATE
          LIABILITY SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNT PAID BY YOU TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00 USD).
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">9. Dispute resolution, mandatory individual arbitration &amp; class action waiver</h2>
        <p className="leading-relaxed">
          Any dispute or claim arising out of or relating to these Terms or Mail Falcon shall be resolved exclusively through final and binding
          individual arbitration administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules.
          YOU AND KINETIC HELIX LLC WAIVE ANY RIGHT TO A JURY TRIAL.
        </p>
        <p className="leading-relaxed">
          <strong>CLASS ACTION WAIVER:</strong> YOU AND KINETIC HELIX LLC AGREE THAT ALL CLAIMS MUST BE BROUGHT IN AN INDIVIDUAL CAPACITY AND NOT AS A
          PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING.
        </p>
        <p className="leading-relaxed">
          <strong>30-Day Opt-Out:</strong> You may opt out of this arbitration agreement within thirty (30) days of first registering by emailing{' '}
          <a href="mailto:legal@kinetichelix.io?subject=Arbitration%20Opt-Out%20-%20Mail%20Falcon" className="text-falcon-600 underline hover:text-falcon-700">
            legal@kinetichelix.io
          </a>{' '}
          with your full name and account email.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">10. One-year limitation on claims &amp; fee shifting</h2>
        <p className="leading-relaxed">
          Any claim or cause of action arising out of or related to Mail Falcon or these Terms must be filed within one (1) year after such claim arose,
          or be forever barred. In any proceeding where Kinetic Helix LLC is the prevailing party, it shall be entitled to recover its reasonable costs and attorneys&apos; fees.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">11. Governing law &amp; Florida venue</h2>
        <p className="leading-relaxed">
          These Terms are governed by and construed in accordance with the laws of the State of Florida, USA, without regard to conflict-of-law principles.
          Any non-arbitrable judicial suit shall be brought exclusively in the state or federal courts located in Broward County or Miami-Dade County, Florida.
        </p>

        <h2 className="mt-6 text-base font-semibold text-falcon-700">12. Changes &amp; contact</h2>
        <p className="leading-relaxed">
          We may update these Terms periodically. Questions or formal legal notices? Email Kinetic Helix LLC Legal Department at{' '}
          <a href="mailto:legal@kinetichelix.io" className="text-falcon-600 underline hover:text-falcon-700">
            legal@kinetichelix.io
          </a>{' '}
          or general customer support at{' '}
          <a href="mailto:hello@mailfalcon.app" className="text-falcon-600 underline hover:text-falcon-700">
            hello@mailfalcon.app
          </a>
          .
        </p>
      </section>
    </main>
  )
}
