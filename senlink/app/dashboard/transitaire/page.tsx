import Link from 'next/link'
import { color, shared } from '@/lib/theme'

export default function DashboardTransitairePage() {
  return (
    <main style={shared.page}>
      <h1 style={{ ...shared.titre, fontSize: 26, margin: '0 0 8px' }}>Espace transitaire</h1>
      <p style={styles.soustitre}>
        Vous avez été affecté(e) comme transitaire partenaire sur une ou plusieurs organisations clientes
        SenLink. Vous pouvez consulter leurs conteneurs et saisir le statut douanier dès que vous le
        connaissez.
      </p>
      <div style={styles.liens}>
        <Link href="/dashboard/conteneurs" style={styles.carteLink}>
          Statut douanier des conteneurs
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
