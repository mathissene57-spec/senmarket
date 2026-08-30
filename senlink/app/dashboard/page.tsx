import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { USER_ROLE_LABELS, type UserRole } from '@/lib/shipment-status'

const ROLE_ROUTES: Record<UserRole, string> = {
  client: '/dashboard/client',
  agent_point_relais: '/dashboard/agent',
  transporteur: '/dashboard/transporteur',
  admin: '/dashboard/admin',
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
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  if (erreur) {
    return (
      <main style={styles.page}>
        <div style={styles.erreur}>
          Impossible de charger votre tableau de bord pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      </main>
    )
  }

  if (roles.length === 0) {
    return (
      <main style={styles.page}>
        <p style={styles.vide}>
          Aucun rôle associé à votre compte pour le moment. Contactez un
          administrateur SenLink.
        </p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Tableau de bord</h1>
      <div style={styles.grid}>
        {roles.map((role) => (
          <Link key={role} href={ROLE_ROUTES[role]} style={styles.carte}>
            {USER_ROLE_LABELS[role]}
          </Link>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 720, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '0 0 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 },
  carte: {
    display: 'block', padding: 24, borderRadius: 12, background: '#0A1A0F',
    color: '#fff', fontWeight: 700, textDecoration: 'none', textAlign: 'center',
  },
  vide: { color: '#3D3D3D', fontSize: 15 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
}
