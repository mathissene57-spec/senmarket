import Link from 'next/link'
import { color, shared } from '@/lib/theme'

export default function DashboardOrgViewerPage() {
  return (
    <main style={shared.page}>
      <h1 style={{ ...shared.titre, fontSize: 26, margin: '0 0 8px' }}>Espace organisation</h1>
      <p style={styles.soustitre}>
        Vous êtes le contact SenLink d&apos;une ou plusieurs organisations clientes. Vous pouvez consulter
        le suivi de leurs conteneurs et recevez une notification à chaque changement de statut (transport
        ou douane).
      </p>
      <div style={styles.liens}>
        <Link href="/dashboard/conteneurs" style={styles.carteLink}>
          Suivi des conteneurs
        </Link>
        <Link href="/dashboard/client/notifications" style={styles.carteLienSecondaire}>
          Notifications
        </Link>
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  soustitre: { color: color.muted, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 24px', maxWidth: 560 },
  liens: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  carteLink: {
    display: 'inline-block', padding: '16px 24px', borderRadius: 12,
    background: '#0B2418', border: '1px solid #D4A017', color: '#D4A017',
    fontWeight: 700, textDecoration: 'none',
  },
  carteLienSecondaire: {
    display: 'inline-block', padding: '16px 24px', borderRadius: 12,
    background: color.surface, border: `1px solid ${color.borderStrong}`, color: color.inkStrong,
    fontWeight: 700, textDecoration: 'none',
  },
}
