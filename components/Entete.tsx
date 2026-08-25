'use client'

import Link from 'next/link'
import { usePanier } from '@/lib/panier/PanierProvider'

export function Entete() {
  const { items } = usePanier()
  const nbArticles = items.reduce((n, i) => n + i.quantite, 0)

  return (
    <header style={styles.entete}>
      <Link href="/" style={styles.logo}>
        Sen<span style={{ color: '#F5B800' }}>Market</span>
      </Link>
      <nav style={styles.nav}>
        <Link href="/catalogue" style={styles.lien}>
          Catalogue
        </Link>
        <Link href="/panier" style={styles.lienPanier}>
          🛒 Panier
          {nbArticles > 0 && <span style={styles.badge}>{nbArticles}</span>}
        </Link>
      </nav>
    </header>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  entete: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px clamp(16px, 5vw, 64px)',
    background: '#FFFFFF',
    borderBottom: '1px solid #E8E2D9',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 900,
    color: '#1A1A1A',
    textDecoration: 'none',
  },
  nav: { display: 'flex', alignItems: 'center', gap: 20 },
  lien: { color: '#3D3D3D', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
  lienPanier: {
    position: 'relative',
    color: '#006B3C',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -14,
    background: '#C41E3A',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    borderRadius: '50%',
    minWidth: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
  },
}
