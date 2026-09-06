// Coquille (section 7 du document de référence — interface agent point
// relais). Pas de scan QR caméra réel ni de logique de pesée/photo dans ce
// scaffold : boutons désactivés en attendant le chantier 3 (UX/UI) et un
// vrai projet Supabase.
const ACTIONS = [
  'Nouveau colis',
  'Scanner colis',
  'Peser',
  'Photographier',
  'Réceptionner',
  'Retrait',
  'Incident',
]

export default function DashboardAgentPage() {
  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Point relais</h1>
      <p style={styles.soustitre}>
        Interface extrêmement simple, pensée pour un usage mobile en boutique.
      </p>
      <div style={styles.grid}>
        {ACTIONS.map((a) => (
          <button key={a} style={styles.bouton} disabled>
            {a}
          </button>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 480, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 14, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  bouton: {
    padding: '20px 12px', borderRadius: 12, border: '1px solid #E8E2D9',
    background: '#F8F6F1', color: '#8A8A8A', fontWeight: 700, fontSize: 14,
    cursor: 'not-allowed',
  },
}
