import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-falcon-700">MailFalcon</h1>
      <p className="mt-2 text-falcon-500">
        Email tracking for Gmail — opens, clicks, real-time notifications.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/sign-in"
          className="rounded bg-falcon-500 px-4 py-2 text-sm font-medium text-white hover:bg-falcon-600"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded border border-falcon-200 px-4 py-2 text-sm font-medium text-falcon-700 hover:bg-falcon-50"
        >
          Dashboard
        </Link>
      </div>
    </main>
  )
}
