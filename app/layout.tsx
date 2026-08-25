import type { Metadata } from 'next'
import './globals.css'
import { PanierProvider } from '@/lib/panier/PanierProvider'
import { Entete } from '@/components/Entete'

export const metadata: Metadata = {
  title: 'SenMarket -- Dashboard Vendeur',
  description: 'Marketplace senegalaise au Maroc',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <PanierProvider>
          <Entete />
          {children}
        </PanierProvider>
      </body>
    </html>
  )
}
