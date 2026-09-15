import { messageUtilisateur } from '@/lib/errors'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { USER_ROLE_LABELS, type UserRole } from '@/lib/shipment-status'
import { color, shared } from '@/lib/theme'

const ROLE_ROUTES: Record<UserRole, string> = {
  client: '/dashboard/client',
  agent_point_relais: '/dashboard/agent',
  transporteur: '/dashboard/transporteur',
  admin: '/dashboard/admin',
}

const ROLE_DESC: Record<UserRole, string> = {
  client: 'Envois, suivi, notifications',
  agent_point_relais: 'Dépôt, contrôle, retrait',
  transporteur: 'Lots, scans, corridor',
  admin: 'Réseau, audit, supervision',
}

export default async function DashboardPage() {
  let roles: UserRole[] = []
  let erreur: string | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
      roles = (data ?? []).map((r) => r.role as UserRole)
    }
  } catch (e) {
    erreur = messageUtilisateur(e)
  }

  if (erreur) {
    return (
      <main style={shared.page}>
        <div style={styles.erreur}>
          Action non disponible pour le moment. Réessayez dans un instant.
        </div>
      </main>
    )
  }

  if (roles.length === 0) {
    return (
      <main style={shared.page}>
        <p style={styles.vide}>
          Aucun rôle associé à votre compte pour le moment. Contactez un
          administrateur SenLink.
        </p>
      </main>
    )
  }

  return (
    <main style={shared.page}>
      <p style={styles.kicker}>Espace de travail</p>
      <h1 style={{ ...shared.titre, fontSize: 28, margin: '0 0 28px' }}>Tableau de bord</h1>
      <div style={styles.grid}>
        {roles.map((role, i) => (
          <Link
            key={role}
            href={ROLE_ROUTES[role]}
            className="sl-fade-in sl-card-hover"
            style={{ ...styles.carte, animationDelay: `${i * 60}ms` }}
          >
            <div style={styles.carteLabel}>{USER_ROLE_LABELS[role]}</div>
            <div style={styles.carteDesc}>{ROLE_DESC[role]}</div>
          </Link>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  kicker: { fontSize: 12, fontWeight: 700, color: color.green600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  carte: {
    display: 'block', padding: 24, borderRadius: 16,
    background: `linear-gradient(135deg, ${color.green900}, ${color.green800})`,
    color: '#fff', textDecoration: 'none',
  },
  carteLabel: { fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 19, marginBottom: 6 },
  carteDesc: { fontSize: 12.5, color: '#C9D6CE' },
  vide: { color: color.muted, fontSize: 15 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14 },
}
