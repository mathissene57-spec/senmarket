import type { Metadata, Viewport } from 'next'
import { Alexandria } from 'next/font/google'
import './globals.css'

// Refonte identite visuelle (demande produit : que la plateforme "sente
// l'Afrique", se distingue d'un clone generique plutot que de rester sur
// une pile systeme/police neutre interchangeable). Alexandria est une
// geometrique moderne originaire d'Egypte (couverture Arabe + Latin) --
// donne un caractere regional marque tout en restant tres lisible en
// petites tailles (chiffres de prix, badges). Chargee via next/font
// (aucune requete CDN, pas de FOUC) et exposee en variable CSS pour que
// globals.css la combine avec la pile systeme en repli.
const alexandria = Alexandria({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

// P7 (plan de finalisation V1) : jusqu'ici le service worker existait
// (notifications push) mais aucun manifest -- l'app n'etait donc jamais
// vraiment "installable" (pas de proposition Ajouter a l'ecran d'accueil
// sur Android/iOS), pourtant essentiel pour des chauffeurs/passagers qui
// utilisent l'app au quotidien comme une app native.
export const metadata: Metadata = {
  title: 'Mobility OS Maroc',
  description: 'Plateforme de mobilité multi-services en marque blanche',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#7A3B1E',
  width: 'device-width',
  initialScale: 1,
  // Pas de maximumScale=1 : bloquer le zoom nuit a l'accessibilite (WCAG
  // 1.4.4) pour un utilisateur malvoyant, un cout superieur au benefice
  // "app native" recherche ici.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={alexandria.variable}>
      <body>{children}</body>
    </html>
  )
}
