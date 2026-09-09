'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Affiliation = { pickup_point_id: string | null; hub_id: string | null }

export default function DashboardAgentPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [affiliation, setAffiliation] = useState<Affiliation | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')

        const { data, error } = await supabase
          .from('user_roles')
          .select('pickup_point_id, hub_id')
          .eq('user_id', user.id)
          .eq('role', 'agent_point_relais')
          .maybeSingle()
        if (error) throw error
        setAffiliation((data ?? { pickup_point_id: null, hub_id: null }) as Affiliation)
      } catch (e) {
        setErreur(messageErreur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Point relais</h1>
      <p style={styles.soustitre}>
        Interface pensée pour un usage mobile en boutique : dépôt, contrôle et
        retrait d&apos;un colis en cherchant simplement son code de suivi.
      </p>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger votre affectation pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && affiliation && (
        <div style={styles.grid}>
          {affiliation.pickup_point_id && (
            <Link href="/dashboard/agent/point-relais" style={styles.carte}>
              Dépôt · Contrôle · Retrait
            </Link>
          )}
          {affiliation.hub_id && (
            <Link href="/dashboard/agent/hub" style={styles.carte}>
              Réception hub
            </Link>
          )}
          {!affiliation.pickup_point_id && !affiliation.hub_id && (
            <p style={styles.vide}>
              Ce compte n&apos;est encore affecté à aucun point relais ni
              hub — contacte un administrateur SenLink.
            </p>
          )}
        </div>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 480, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  grid: { display: 'flex', flexDirection: 'column', gap: 12 },
  carte: {
    padding: '20px 18px', borderRadius: 12, border: '1px solid #0A1A0F',
    background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 14,
    textAlign: 'center', textDecoration: 'none',
  },
}
