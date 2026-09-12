'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type PickupPoint = {
  id: string
  name: string
  city: string
  country: string
  address: string | null
  phone: string | null
}

export default function ClientPointsRelaisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        // pickup_points_public_read (RLS) : lecture ouverte à tous.
        const { data, error } = await supabase
          .from('pickup_points')
          .select('id, name, city, country, address, phone')
          .eq('active', true)
          .order('city')
        if (error) throw error
        setPoints((data ?? []) as PickupPoint[])
      } catch (e) {
        setErreur(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/client" style={styles.retour}>
          ← Espace client
        </Link>
        <h1 style={styles.titre}>Points relais</h1>
        <p style={styles.soustitre}>Où déposer ou retirer un colis.</p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les points relais pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && points.length === 0 && (
        <p style={styles.vide}>Aucun point relais actif pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {points.map((p) => (
          <div key={p.id} style={styles.card}>
            <div style={styles.nom}>{p.name}</div>
            <div style={styles.ligne}>
              {p.city}, {p.country}
            </div>
            {p.address && <div style={styles.ligneMuted}>{p.address}</div>}
            {p.phone && <div style={styles.ligneMuted}>{p.phone}</div>}
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 4, background: '#fff',
  },
  nom: { fontWeight: 700, fontSize: 15, color: '#0B2418' },
  ligne: { fontSize: 13, color: '#66756D' },
  ligneMuted: { fontSize: 12.5, color: '#66756D' },
}
