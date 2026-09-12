// Palette "African Logistics Core" — source unique de vérité pour les
// couleurs de l'UI. Objets style inline (convention du projet, pas de
// framework CSS) : tous les composants doivent importer depuis ici plutôt
// que coder des hex en dur, pour que la palette reste cohérente et
// modifiable en un seul endroit.
export const color = {
  bg: '#F7F5EF', // ivoire chaud — fond principal
  surface: '#FFFFFF', // cartes
  border: '#E7E1D3', // bordure subtile sur ivoire
  borderStrong: '#D8D0BC',

  ink: '#0B2418', // texte principal (dérivé du vert profond)
  inkStrong: '#061B12', // titres, fonds sombres
  muted: '#66756D', // texte secondaire

  green900: '#061B12',
  green800: '#0B2418',
  green600: '#006B3C',
  green400: '#00C878',

  gold: '#D4A017',
  danger: '#E5484D',

  // Teintes claires dérivées, pour badges/bandeaux de fond.
  greenTint: '#E4F7EC',
  goldTint: '#FBF1DA',
  dangerTint: '#FBE7E8',
} as const

export const shadow = {
  card: '0 1px 2px rgba(6,27,18,0.04), 0 8px 24px rgba(6,27,18,0.05)',
  cardHover: '0 2px 4px rgba(6,27,18,0.06), 0 16px 32px rgba(6,27,18,0.08)',
}

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
}

// Styles partagés réutilisés tels quels par de nombreuses pages (cartes,
// badges, boutons) pour éviter de redéfinir la même chose partout.
export const shared: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 1080, margin: '0 auto', padding: 'clamp(20px, 4vw, 48px) clamp(16px, 4vw, 32px) 64px' },
  card: {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
  },
  titre: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 900,
    color: color.inkStrong,
    letterSpacing: -0.3,
  },
  boutonPrimaire: {
    padding: '12px 20px',
    borderRadius: radius.sm,
    border: 'none',
    background: color.green900,
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  boutonSecondaire: {
    padding: '12px 20px',
    borderRadius: radius.sm,
    border: `1px solid ${color.border}`,
    background: color.surface,
    color: color.ink,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  input: {
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: `1px solid ${color.border}`,
    fontSize: 14,
    background: color.surface,
    color: color.ink,
  },
}
