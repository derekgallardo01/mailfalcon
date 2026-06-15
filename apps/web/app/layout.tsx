import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

const SITE_URL = 'https://app.mailfalcon.app'
const TITLE = 'MailFalcon — Email tracking for Gmail'
const DESCRIPTION =
  'Know the moment your email is read. Real-time opens, clicks, and full device + location detail for Gmail.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · MailFalcon',
  },
  description: DESCRIPTION,
  applicationName: 'MailFalcon',
  keywords: [
    'email tracking',
    'gmail tracking',
    'open tracking',
    'click tracking',
    'mailtrack alternative',
  ],
  authors: [{ name: 'MailFalcon' }],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'MailFalcon',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'MailFalcon',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/icon.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#3b6cb7',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-falcon-50 text-falcon-900 font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-falcon-200 bg-white py-4 text-center text-xs text-falcon-500">
            <Link href="/" className="hover:text-falcon-700">
              MailFalcon
            </Link>
            <span className="mx-2">·</span>
            <Link href="/templates" className="hover:text-falcon-700">
              Templates
            </Link>
            <span className="mx-2">·</span>
            <Link href="/settings" className="hover:text-falcon-700">
              Settings
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
