import Link from 'next/link'

const CARTES = [
  { label: 'Créer un envoi', href: '/envois/nouveau' },
  { label: 'Suivre un colis', href: '/suivi' },
  { label: 'Historique', href: '/dashboard/client/historique' },
  { label: 'Notifications', href: '/dashboard/client/notifications' },
  { label: 'Points relais', href: '/dashboard/client/points-relais' },
  { label: 'Incidents', href: '/dashboard/client/incidents' },
]

export default function DashboardClientPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Espace client</h1>
      <div style={styles.grid}>
        {CARTES.map((c) => (
          <Link key={c.label} href={c.href} style={styles.carte}>
            {c.label}
          </Link>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 720, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 },
  carte: {
    display: 'block', padding: 20, borderRadius: 12, background: '#fff',
    border: '1px solid #E8E2D9', color: '#0A1A0F', fontWeight: 700,
    textDecoration: 'none', textAlign: 'center',
  },
}
