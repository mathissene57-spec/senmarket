import { color, radius, shadow } from '@/lib/theme'

type CorridorStat = { value: string | number; label: string }

type CorridorVisualProps = {
  origin?: string
  destination?: string
  /** Uniquement des chiffres réellement disponibles — jamais inventés. */
  stats?: CorridorStat[]
}

// Section visuelle "Corridor Maroc ↔ Sénégal" — structure toujours affichée,
// les statistiques ne le sont que si des données réelles sont fournies.
export function CorridorVisual({ origin = 'Casablanca', destination = 'Dakar', stats }: CorridorVisualProps) {
  return (
    <div className="sl-fade-in" style={styles.card}>
      <div style={styles.kicker}>Corridor Maroc ↔ Sénégal</div>
      <div style={styles.ligne}>
        <div style={styles.noeud}>
          <div style={styles.point} />
          <div style={styles.ville}>{origin.toUpperCase()}</div>
        </div>

        <svg width="100%" height="24" viewBox="0 0 200 24" preserveAspectRatio="none" style={styles.svg}>
          <line x1="4" y1="12" x2="196" y2="12" stroke={color.border} strokeWidth="2" />
          <line
            x1="4"
            y1="12"
            x2="196"
            y2="12"
            stroke={color.green400}
            strokeWidth="2"
            strokeDasharray="6 6"
            className="sl-flow-line"
          />
        </svg>

        <div style={styles.noeud}>
          <div style={styles.point} />
          <div style={styles.ville}>{destination.toUpperCase()}</div>
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div style={styles.stats}>
          {stats.map((s) => (
            <div key={s.label} style={styles.stat}>
              <div style={styles.statValeur}>{s.value}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    background: `linear-gradient(135deg, ${color.green900}, ${color.green800})`,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    padding: '24px clamp(16px, 4vw, 32px)',
    color: '#fff',
  },
  kicker: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.green400,
    marginBottom: 20,
  },
  ligne: { display: 'flex', alignItems: 'center', gap: 8 },
  svg: { flex: 1, display: 'block', minWidth: 40 },
  noeud: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 },
  point: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: color.green400,
    boxShadow: `0 0 0 4px rgba(0,200,120,0.18)`,
  },
  ville: { fontSize: 13, fontWeight: 800, letterSpacing: 0.5 },
  stats: {
    display: 'flex',
    gap: 'clamp(16px, 4vw, 40px)',
    marginTop: 24,
    paddingTop: 20,
    borderTop: '1px solid rgba(255,255,255,0.12)',
    flexWrap: 'wrap',
  },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statValeur: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900 },
  statLabel: { fontSize: 11.5, color: '#C9D6CE' },
}
