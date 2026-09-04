// Coquille (section 7 du document de référence — dashboard admin).
const CARTES = [
  'Tous les colis',
  'Flux Maroc/Sénégal',
  'Transporteurs',
  'Points relais',
  'Incidents',
  'Retards',
  'Analytics',
  'Revenus',
  'Audit logs',
]

export default function DashboardAdminPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Administration SenLink</h1>
      <div style={styles.grid}>
        {CARTES.map((c) => (
          <div key={c} style={styles.carte}>
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
}
