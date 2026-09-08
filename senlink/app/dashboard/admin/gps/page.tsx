'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Lot = { id: string; lot_code: string; origin_hub_id: string; destination_hub_id: string }
type Hub = { id: string; name: string; city: string }

export default function AdminGpsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [lotsRes, hubsRes] = await Promise.all([
          supabase
            .from('shipment_lots')
            .select('id, lot_code, origin_hub_id, destination_hub_id')
            .eq('status', 'in_transit')
            .order('created_at', { ascending: false }),
          supabase.from('hubs').select('id, name, city'),
        ])
        if (lotsRes.error) throw lotsRes.error
        if (hubsRes.error) throw hubsRes.error
        setLots((lotsRes.data ?? []) as Lot[])
        setHubs((hubsRes.data ?? []) as Hub[])
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  function hubLabel(id: string) {
    const h = hubs.find((h) => h.id === id)
    return h ? `${h.name} (${h.city})` : id
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Suivi GPS</h1>
        <p style={styles.soustitre}>Lots actuellement en transit — position en direct des transporteurs.</p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les lots en transit pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && lots.length === 0 && (
        <p style={styles.vide}>Aucun lot en transit pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {lots.map((lot) => (
          <Link key={lot.id} href={`/dashboard/admin/gps/${lot.id}`} style={styles.card}>
            <div style={styles.code}>{lot.lot_code}</div>
            <div style={styles.route}>
              {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
            </div>
          </Link>
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
    textDecoration: 'none', color: 'inherit',
  },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  route: { fontSize: 13, color: '#3D3D3D' },
}
