'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, USER_ROLE_LABELS, type ShipmentStatus, type UserRole } from '@/lib/shipment-status'

type ShipmentEvent = {
  id: string
  shipment_id: string
  event_type: string
  new_status: string | null
  actor_role: string | null
  location_text: string | null
  created_at: string
}

type ShipmentOption = { id: string; tracking_code: string }

const LIMITE = 100

export default function AdminAuditPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<ShipmentEvent[]>([])
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        // shipment_events est le journal d'audit append-only (section 16 du
        // document de référence) — can_access_shipment() inclut is_admin().
        const [eventsRes, shipmentsRes] = await Promise.all([
          supabase
            .from('shipment_events')
            .select('id, shipment_id, event_type, new_status, actor_role, location_text, created_at')
            .order('created_at', { ascending: false })
            .limit(LIMITE),
          supabase.from('shipments').select('id, tracking_code'),
        ])
        if (eventsRes.error) throw eventsRes.error
        if (shipmentsRes.error) throw shipmentsRes.error
        setEvents((eventsRes.data ?? []) as ShipmentEvent[])
        setShipments((shipmentsRes.data ?? []) as ShipmentOption[])
      } catch (e) {
        setErreur(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  function trackingCode(id: string) {
    return shipments.find((s) => s.id === id)?.tracking_code ?? id
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Audit logs</h1>
        <p style={styles.soustitre}>
          Les {LIMITE} derniers événements enregistrés sur tous les colis
          (journal append-only, jamais modifié après coup).
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger le journal pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && events.length === 0 && (
        <p style={styles.vide}>Aucun événement enregistré pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {events.map((e) => (
          <div key={e.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{trackingCode(e.shipment_id)}</span>
              <span style={styles.date}>{new Date(e.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <div style={styles.type}>
              {SHIPMENT_STATUS_LABELS[e.event_type as ShipmentStatus] ?? e.event_type}
              {e.new_status && ` → ${SHIPMENT_STATUS_LABELS[e.new_status as ShipmentStatus] ?? e.new_status}`}
            </div>
            <div style={styles.meta}>
              {e.actor_role ? USER_ROLE_LABELS[e.actor_role as UserRole] ?? e.actor_role : 'rôle inconnu'}
              {e.location_text && ` · ${e.location_text}`}
            </div>
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
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 12, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 4, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 13, color: '#0B2418' },
  date: { fontSize: 11, color: '#66756D' },
  type: { fontSize: 13, color: '#0B2418', fontWeight: 600 },
  meta: { fontSize: 12, color: '#66756D' },
}
