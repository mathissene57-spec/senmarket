import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Rafraichissement design (finition UX) : une police caracteristique plutot
// que la pile systeme neutre precedente. Plus Jakarta Sans reste tres lisible
// en petites tailles (chiffres de prix, badges) tout en donnant un ton plus
// affirme, coherent avec une marque mobilite. Chargee via next/font (aucune
// requete CDN, pas de FOUC) et exposee en variable CSS pour que globals.css
// la combine avec la pile systeme en repli.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mobility OS Maroc',
  description: 'Plateforme de mobilité multi-services en marque blanche',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  )
}
