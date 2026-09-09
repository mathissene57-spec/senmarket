'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INCIDENT_STATUS_LABELS, type IncidentStatus } from '@/lib/shipment-status'

type Retard = {
  id: string
  shipment_id: string
  description: string | null
  status: IncidentStatus
  created_at: string
}

type ShipmentOption = { id: string; tracking_code: string }

export default function AdminRetardsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [retards, setRetards] = useState<Retard[]>([])
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        // « Retard » = incident de type 'retard' non clôturé — seule notion de
        // délai qui existe réellement dans le schéma (pas d'ETA/SLA modélisé).
        const [retardsRes, shipmentsRes] = await Promise.all([
          supabase
            .from('incidents')
            .select('id, shipment_id, description, status, created_at')
            .eq('type', 'retard')
            .neq('status', 'closed')
            .order('created_at', { ascending: false }),
          supabase.from('shipments').select('id, tracking_code'),
        ])
        if (retardsRes.error) throw retardsRes.error
        if (shipmentsRes.error) throw shipmentsRes.error
        setRetards((retardsRes.data ?? []) as Retard[])
        setShipments((shipmentsRes.data ?? []) as ShipmentOption[])
      } catch (e) {
        setErreur(messageErreur(e))
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
        <h1 style={styles.titre}>Retards</h1>
        <p style={styles.soustitre}>
          Incidents de type « retard » non clôturés. Le traitement se fait
          depuis <Link href="/dashboard/admin/incidents" style={styles.lien}>Incidents</Link>.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les retards pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && retards.length === 0 && (
        <p style={styles.vide}>Aucun retard signalé pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {retards.map((r) => (
          <Link key={r.id} href="/dashboard/admin/incidents" style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{trackingCode(r.shipment_id)}</span>
              <span style={styles.badge}>{INCIDENT_STATUS_LABELS[r.status]}</span>
            </div>
            {r.description && <div style={styles.desc}>{r.description}</div>}
            <div style={styles.date}>{new Date(r.created_at).toLocaleString('fr-FR')}</div>
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
  lien: { color: '#00875A', fontWeight: 700 },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
    textDecoration: 'none', color: 'inherit',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FFF6DE', color: '#8A5A00',
  },
  desc: { fontSize: 12.5, color: '#6A8572' },
  date: { fontSize: 11.5, color: '#8A8A8A' },
}
