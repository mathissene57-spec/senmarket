import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mobility OS Maroc',
  description: 'Plateforme de mobilité multi-services en marque blanche',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
