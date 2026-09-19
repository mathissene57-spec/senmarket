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
  lot_id: string | null
}

export default function ColisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        // RLS (shipments_client_select) ne renvoie que les colis visibles par
        // ce transporteur (assignés à lui, via son organisation).
        const { data, error } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, origin_city, destination_city, lot_id')
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
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Colis</h1>
        <p style={styles.soustitre}>
          Tous les colis visibles pour ce compte transporteur (lecture seule —
          les actions de transit se font depuis « Scans »).
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
        <p style={styles.vide}>Aucun colis visible pour ce compte.</p>
      )}

      <div style={styles.list}>
        {shipments.map((s) => (
          <div key={s.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{s.tracking_code}</span>
              <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[s.status]}</span>
            </div>
            <div style={styles.route}>
              {s.origin_city} → {s.destination_city}
            </div>
            {s.lot_id && <div style={styles.lotTag}>Dans un lot</div>}
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
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0B2418' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FBF1DA', color: '#8A6100',
  },
  route: { fontSize: 13, color: '#66756D' },
  lotTag: { fontSize: 11.5, color: '#006B3C', fontWeight: 600 },
}
