'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'

type Shipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  origin_city: string
  destination_city: string
  created_at: string
}

export default function AdminColisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        // is_admin() dans shipments_client_select donne accès à tous les colis.
        const { data, error } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, origin_city, destination_city, created_at')
          .order('created_at', { ascending: false })

        if (error) throw error
        setShipments((data ?? []) as Shipment[])
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
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Tous les colis</h1>
        <p style={styles.soustitre}>
          Vue globale, lecture seule — {shipments.length} colis. Le suivi
          public de chacun est accessible via son code.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les colis pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && shipments.length === 0 && (
        <p style={styles.vide}>Aucun colis pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {shipments.map((s) => (
          <Link key={s.id} href={`/suivi/${s.tracking_code}`} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{s.tracking_code}</span>
              <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[s.status]}</span>
            </div>
            <div style={styles.route}>
              {s.origin_city} → {s.destination_city}
            </div>
            <div style={styles.date}>{new Date(s.created_at).toLocaleString('fr-FR')}</div>
          </Link>
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
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
    textDecoration: 'none', color: 'inherit',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0B2418' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FBF1DA', color: '#8A6100',
  },
  route: { fontSize: 13, color: '#66756D' },
  date: { fontSize: 11.5, color: '#66756D' },
}
