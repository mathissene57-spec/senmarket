'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type PickupPoint = {
  id: string
  name: string
  city: string
  country: string
  active: boolean
  hub_id: string | null
}

type Hub = { id: string; name: string }

export default function AdminPointsRelaisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [pointsRes, hubsRes] = await Promise.all([
          supabase
            .from('pickup_points')
            .select('id, name, city, country, active, hub_id')
            .order('name'),
          supabase.from('hubs').select('id, name'),
        ])
        if (pointsRes.error) throw pointsRes.error
        if (hubsRes.error) throw hubsRes.error
        setPoints((pointsRes.data ?? []) as PickupPoint[])
        setHubs((hubsRes.data ?? []) as Hub[])
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  function hubName(id: string | null) {
    if (!id) return null
    return hubs.find((h) => h.id === id)?.name ?? null
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Points relais</h1>
        <p style={styles.soustitre}>{points.length} point(s) relais enregistré(s).</p>
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
        <p style={styles.vide}>Aucun point relais enregistré.</p>
      )}

      <div style={styles.list}>
        {points.map((p) => (
          <div key={p.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{p.name}</span>
              <span style={p.active ? styles.badgeActif : styles.badgeInactif}>
                {p.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <div style={styles.ligne}>
              {p.city}, {p.country}
            </div>
            {hubName(p.hub_id) && <div style={styles.ligne}>Hub : {hubName(p.hub_id)}</div>}
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#00875A', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: '#0A1A0F' },
  badgeActif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#EAFBF2', color: '#00875A',
  },
  badgeInactif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#F1F1F1', color: '#6A6A6A',
  },
  ligne: { fontSize: 13, color: '#3D3D3D' },
}
