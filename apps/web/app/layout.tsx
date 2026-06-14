import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'mailfalcon',
  description: 'Email tracking for Gmail.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-falcon-50 text-falcon-900 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
