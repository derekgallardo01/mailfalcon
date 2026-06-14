import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

export const metadata = {
  title: 'mailfalcon',
  description: 'Email tracking for Gmail.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-falcon-50 text-falcon-900 font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-falcon-200 bg-white py-4 text-center text-xs text-falcon-500">
            <Link href="/" className="hover:text-falcon-700">
              mailfalcon
            </Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-falcon-700">
              Privacy policy
            </Link>
            <span className="mx-2">·</span>
            <a
              href="mailto:hello@mailfalcon.app"
              className="hover:text-falcon-700"
            >
              hello@mailfalcon.app
            </a>
          </footer>
        </div>
      </body>
    </html>
  )
}
