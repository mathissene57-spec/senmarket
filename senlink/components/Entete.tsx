'use client'

import Link from 'next/link'
import { color } from '@/lib/theme'

export function Entete() {
  return (
    <header style={styles.entete}>
      <Link href="/" style={styles.logo}>
        Sen<span style={{ color: color.gold }}>Link</span>
      </Link>
      <nav style={styles.nav}>
        <span className="sl-nav-secondary" style={{ gap: 'clamp(8px, 3vw, 20px)' }}>
          <Link href="/suivi" style={styles.lien}>
            Suivre un colis
          </Link>
          <Link href="/envois/nouveau" style={styles.lien}>
            Expédier
          </Link>
        </span>
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
    gap: 8,
    padding: '14px clamp(16px, 5vw, 64px)',
    background: color.green900,
    borderBottom: `1px solid ${color.green800}`,
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
    flexShrink: 0,
  },
  nav: { display: 'flex', alignItems: 'center', gap: 'clamp(8px, 3vw, 20px)', flexShrink: 0 },
  lien: {
    color: '#C9D6CE', fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  lienDashboard: {
    color: color.green400,
    fontSize: 13.5,
    fontWeight: 700,
    textDecoration: 'none',
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid rgba(0,200,120,0.35)`,
    whiteSpace: 'nowrap',
  },
}
