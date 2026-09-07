import Link from 'next/link'

// Section 7 du document de référence — dashboard transporteur. Toutes les
// cartes sont désormais des écrans réels (voir les sous-dossiers).
const CARTES = [
  { label: 'Colis', href: '/dashboard/transporteur/colis' },
  { label: 'Lots', href: '/dashboard/transporteur/lots' },
  { label: 'Scans', href: '/dashboard/transporteur/scans' },
  { label: 'Départs', href: '/dashboard/transporteur/departs' },
  { label: 'Arrivées', href: '/dashboard/transporteur/arrivees' },
  { label: 'Incidents', href: '/dashboard/transporteur/incidents' },
  { label: 'Manifestes', href: '/dashboard/transporteur/manifestes' },
  { label: 'Performance', href: '/dashboard/transporteur/performance' },
]

export default function DashboardTransporteurPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Espace transporteur</h1>
      <div style={styles.grid}>
        {CARTES.map((c) =>
          c.href ? (
            <Link key={c.label} href={c.href} style={styles.carteLink}>
              {c.label}
            </Link>
          ) : (
            <div key={c.label} style={styles.carte}>
              {c.label}
            </div>
          )
        )}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 800, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  carte: {
    padding: 20, borderRadius: 12, background: '#fff', border: '1px solid #E8E2D9',
    color: '#0A1A0F', fontWeight: 700, textAlign: 'center',
  },
  carteLink: {
    padding: 20, borderRadius: 12, background: '#0A1A0F', border: '1px solid #0A1A0F',
    color: '#fff', fontWeight: 700, textAlign: 'center', textDecoration: 'none',
  },
}
