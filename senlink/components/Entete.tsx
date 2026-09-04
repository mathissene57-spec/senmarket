'use client'

import Link from 'next/link'

export function Entete() {
  return (
    <header style={styles.entete}>
      <Link href="/" style={styles.logo}>
        Sen<span style={{ color: '#F5B800' }}>Link</span>
      </Link>
      <nav style={styles.nav}>
        <Link href="/suivi" style={styles.lien}>
          Suivre un colis
        </Link>
        <Link href="/envois/nouveau" style={styles.lien}>
          Expédier
        </Link>
        <Link href="/dashboard" style={styles.lienDashboard}>
          Tableau de bord
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
    background: '#0A1A0F',
    borderBottom: '1px solid #163322',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 900,
    color: '#FFFFFF',
    textDecoration: 'none',
  },
  nav: { display: 'flex', alignItems: 'center', gap: 20 },
  lien: { color: '#C9D6CE', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
  lienDashboard: {
    color: '#00C96B',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
  },
}
