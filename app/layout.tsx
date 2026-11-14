import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Plank — simple group money',
  description: 'Collect, track, and share group money without the stress.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/plank-poster.jpeg', type: 'image/jpeg' }],
    apple: '/plank-poster.jpeg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f8f3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
