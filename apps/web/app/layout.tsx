import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

const SITE_URL = 'https://mailfalcon.app'
const TITLE = 'Mail Falcon — Email tracking for Gmail'
const DESCRIPTION =
  'Mail Falcon adds real-time email open and click tracking to Gmail. Know the moment your email is read, with full device and location detail.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · Mail Falcon',
  },
  description: DESCRIPTION,
  applicationName: 'Mail Falcon',
  keywords: [
    'email tracking',
    'gmail tracking',
    'open tracking',
    'click tracking',
    'mailtrack alternative',
  ],
  authors: [{ name: 'Mail Falcon' }],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Mail Falcon',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'Mail Falcon',
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
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Mail Falcon',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#070c18',
  width: 'device-width',
  initialScale: 1,
  // Prevent auto-zoom when tapping the address / body inputs on iOS.
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-falcon-50 text-falcon-600 font-sans antialiased selection:bg-electric-cyan selection:text-falcon-50">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-falcon-200 bg-falcon-100/80 py-5 text-center text-xs text-falcon-400">
            <Link href="/" className="hover:text-electric-cyan transition-colors">
              Mail Falcon
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <Link href="/templates" className="hover:text-electric-cyan transition-colors">
              Templates
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <Link href="/settings" className="hover:text-electric-cyan transition-colors">
              Settings
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <Link href="/privacy" className="hover:text-electric-cyan transition-colors">
              Privacy
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <Link href="/terms" className="hover:text-electric-cyan transition-colors">
              Terms
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <Link href="/refunds" className="hover:text-electric-cyan transition-colors">
              Refunds
            </Link>
            <span className="mx-2 text-falcon-300">·</span>
            <a
              href="mailto:hello@mailfalcon.app"
              className="hover:text-electric-cyan transition-colors"
            >
              hello@mailfalcon.app
            </a>
            <span className="mx-2 text-falcon-300">·</span>
            <a
              href="https://kinetichelix.io"
              target="_blank"
              rel="noopener"
              className="hover:text-electric-cyan transition-colors"
            >
              Built by Kinetic Helix
            </a>
          </footer>
        </div>
      </body>
    </html>
  )
}
