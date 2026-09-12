import type { ReactNode } from 'react'
import { color, radius, shadow } from '@/lib/theme'

type KpiCardProps = {
  icon?: ReactNode
  value: string | number
  label: string
  /** Variation réelle uniquement (ex: "+3 vs hier") — ne jamais inventer. */
  delta?: { text: string; tone: 'up' | 'down' | 'neutral' }
  accent?: 'green' | 'gold' | 'danger' | 'neutral'
}

const ACCENTS: Record<NonNullable<KpiCardProps['accent']>, { bg: string; fg: string }> = {
  green: { bg: color.greenTint, fg: color.green600 },
  gold: { bg: color.goldTint, fg: color.gold },
  danger: { bg: color.dangerTint, fg: color.danger },
  neutral: { bg: '#F0EEE7', fg: color.muted },
}

export function KpiCard({ icon, value, label, delta, accent = 'neutral' }: KpiCardProps) {
  const a = ACCENTS[accent]
  return (
    <div className="sl-fade-in sl-card-hover" style={styles.card}>
      {icon && (
        <div style={{ ...styles.iconBox, background: a.bg, color: a.fg }}>{icon}</div>
      )}
      <div style={styles.valeur}>{value}</div>
      <div style={styles.label}>{label}</div>
      {delta && (
        <div
          style={{
            ...styles.delta,
            color: delta.tone === 'up' ? color.green600 : delta.tone === 'down' ? color.danger : color.muted,
          }}
        >
          {delta.text}
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: '18px 18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  valeur: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 900,
    color: color.inkStrong,
    lineHeight: 1.1,
  },
  label: { fontSize: 12.5, color: color.muted, fontWeight: 600 },
  delta: { fontSize: 11.5, fontWeight: 700, marginTop: 2 },
}
