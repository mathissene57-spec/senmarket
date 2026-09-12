import Link from 'next/link'

// Section 7 du document de référence — dashboard admin. Toutes les cartes
// sont branchées sauf « Revenus » : aucun modèle de prix/commission n'existe
// dans le schéma (paiement hors périmètre, voir docs/blueprint.md) — la
// brancher afficherait des chiffres inventés plutôt que des données réelles.
const CARTES_LIENS: { label: string; href: string }[] = [
  { label: 'Tous les colis', href: '/dashboard/admin/colis' },
  { label: 'Flux Maroc/Sénégal', href: '/dashboard/admin/flux' },
  { label: 'Transporteurs', href: '/dashboard/admin/transporteurs' },
  { label: 'Points relais', href: '/dashboard/admin/points-relais' },
  { label: 'Hubs', href: '/dashboard/admin/hubs' },
  { label: 'Pays', href: '/dashboard/admin/countries' },
  { label: 'Corridors', href: '/dashboard/admin/corridors' },
  { label: 'Retards', href: '/dashboard/admin/retards' },
  { label: 'Analytics', href: '/dashboard/admin/analytics' },
  { label: 'Incidents', href: '/dashboard/admin/incidents' },
  { label: 'Audit logs', href: '/dashboard/admin/audit' },
  { label: 'Suivi GPS', href: '/dashboard/admin/gps' },
]

const CARTES_STATIQUES = ['Revenus']

export default function DashboardAdminPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Administration SenLink</h1>
      <div style={styles.grid}>
        {CARTES_LIENS.map((c) => (
          <Link key={c.href} href={c.href} style={styles.carteLink}>
            {c.label}
          </Link>
        ))}
        {CARTES_STATIQUES.map((c) => (
          <div key={c} style={styles.carte} title="Aucun modèle de prix/commission en base pour l'instant">
            {c}
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 900, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  carte: {
    padding: 20, borderRadius: 12, background: '#0A1A0F', color: '#fff',
    fontWeight: 700, textAlign: 'center',
  },
  carteLink: {
    padding: 20, borderRadius: 12, background: '#0A1A0F', border: '1px solid #F5B800',
    color: '#F5B800', fontWeight: 700, textAlign: 'center', textDecoration: 'none',
  },
}
