'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = { full_name: string | null; phone: string | null; whatsapp_number: string | null }

export default function ProfilPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [transporterName, setTransporterName] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')
        setEmail(user.email ?? null)

        const [profileRes, roleRes] = await Promise.all([
          supabase.from('profiles').select('full_name, phone, whatsapp_number').eq('id', user.id).maybeSingle(),
          supabase
            .from('user_roles')
            .select('transporter_id, transporters(name)')
            .eq('user_id', user.id)
            .eq('role', 'transporteur')
            .maybeSingle(),
        ])
        if (profileRes.error) throw profileRes.error
        setProfile((profileRes.data ?? null) as Profile | null)

        const transporter = roleRes.data?.transporters as unknown as { name: string } | null
        setTransporterName(transporter?.name ?? null)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Profil</h1>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger le profil pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && (
        <>
          <div style={styles.card}>
            <div style={styles.nom}>{profile?.full_name || transporterName || 'Transporteur'}</div>
            {transporterName && <div style={styles.sousLigne}>{transporterName}</div>}
            <div style={styles.champs}>
              <div style={styles.champ}>
                <span style={styles.champLabel}>Email</span>
                <span>{email ?? '—'}</span>
              </div>
              <div style={styles.champ}>
                <span style={styles.champLabel}>Téléphone</span>
                <span>{profile?.phone || '—'}</span>
              </div>
              <div style={styles.champ}>
                <span style={styles.champLabel}>WhatsApp</span>
                <span>{profile?.whatsapp_number || '—'}</span>
              </div>
            </div>
          </div>

          <div style={styles.liens}>
            <Link href="/dashboard/transporteur/planning" style={styles.lien}>
              Planning
            </Link>
          </div>

          <button style={styles.boutonDeco} onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 480, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#00875A', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 0' },
  vide: { color: '#3D3D3D', fontSize: 14 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  card: { border: '1px solid #E8E2D9', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 20 },
  nom: { fontSize: 18, fontWeight: 800, color: '#0A1A0F' },
  sousLigne: { fontSize: 13, color: '#6A8572', marginTop: 2, marginBottom: 16 },
  champs: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  champ: { display: 'flex', justifyContent: 'space-between', fontSize: 13.5 },
  champLabel: { color: '#6A8572' },
  liens: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  lien: {
    padding: '12px 14px', borderRadius: 10, border: '1px solid #E8E2D9',
    background: '#fff', color: '#0A1A0F', fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
  },
  boutonDeco: {
    width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #C41E3A',
    background: '#fff', color: '#C41E3A', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
}
