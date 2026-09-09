'use client'

import { messageErreur } from '@/lib/errors'
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
  lot_id: string | null
}

export default function HistoriquePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [lotsEnTransit, setLotsEnTransit] = useState<Set<string>>(new Set())
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')

        // shipments_client_select : client_user_id = auth.uid() suffit, pas
        // besoin de filtrer côté client — la RLS ne renvoie que ses colis.
        const { data, error } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, origin_city, destination_city, created_at, lot_id')
          .eq('client_user_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        const rows = (data ?? []) as Shipment[]
        setShipments(rows)

        // Le suivi GPS n'existe que pendant que le lot est en transit
        // (record_lot_location() le refuse sinon) — on vérifie lesquels le sont.
        const lotIds = Array.from(new Set(rows.map((s) => s.lot_id).filter((id): id is string => !!id)))
        if (lotIds.length > 0) {
          const { data: lotsData, error: lotsError } = await supabase
            .from('shipment_lots')
            .select('id')
            .in('id', lotIds)
            .eq('status', 'in_transit')
          if (lotsError) throw lotsError
          setLotsEnTransit(new Set((lotsData ?? []).map((l) => l.id as string)))
        } else {
          setLotsEnTransit(new Set())
        }
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
      <div style={styles.head}>
        <Link href="/dashboard/client" style={styles.retour}>
          ← Espace client
        </Link>
        <h1 style={styles.titre}>Historique</h1>
        <p style={styles.soustitre}>Tous les colis que tu as envoyés, du plus récent au plus ancien.</p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger ton historique pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && shipments.length === 0 && (
        <p style={styles.vide}>Aucun envoi pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {shipments.map((s) => {
          const enTransit = s.lot_id != null && lotsEnTransit.has(s.lot_id)
          return (
            <div key={s.id} style={styles.card}>
              <Link href={`/suivi/${s.tracking_code}`} style={styles.cardLien}>
                <div style={styles.cardTop}>
                  <span style={styles.code}>{s.tracking_code}</span>
                  <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[s.status]}</span>
                </div>
                <div style={styles.route}>
                  {s.origin_city} → {s.destination_city}
                </div>
                <div style={styles.date}>{new Date(s.created_at).toLocaleString('fr-FR')}</div>
              </Link>
              {enTransit && (
                <Link href={`/dashboard/client/suivi-gps/${s.lot_id}`} style={styles.gpsLien}>
                  📍 Suivre en direct
                </Link>
              )}
            </div>
          )
        })}
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
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardLien: {
    display: 'flex', flexDirection: 'column', gap: 6,
    textDecoration: 'none', color: 'inherit',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FFF6DE', color: '#8A5A00',
  },
  route: { fontSize: 13, color: '#3D3D3D' },
  date: { fontSize: 11.5, color: '#8A8A8A' },
  gpsLien: {
    alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 700, color: '#00875A',
    textDecoration: 'none',
  },
}
