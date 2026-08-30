// Coquille (section 7 du document de référence — dashboard transporteur).
const CARTES = ['Colis', 'Lots', 'Scans', 'Départs', 'Arrivées', 'Incidents', 'Manifestes', 'Performance']

export default function DashboardTransporteurPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Espace transporteur</h1>
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
  page: { maxWidth: 800, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  carte: {
    padding: 20, borderRadius: 12, background: '#fff', border: '1px solid #E8E2D9',
    color: '#0A1A0F', fontWeight: 700, textAlign: 'center',
  },
}
