'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type IncidentStatus,
  type IncidentType,
} from '@/lib/shipment-status'

type Incident = {
  id: string
  shipment_id: string
  type: IncidentType
  description: string | null
  status: IncidentStatus
  created_at: string
}

type ShipmentOption = { id: string; tracking_code: string }

const INCIDENT_TYPES = Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]

export default function ClientIncidentsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [shipmentId, setShipmentId] = useState('')
  const [type, setType] = useState<IncidentType>('retard')
  const [description, setDescription] = useState('')

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const shipmentsRes = await supabase
        .from('shipments')
        .select('id, tracking_code')
        .eq('client_user_id', user.id)
      if (shipmentsRes.error) throw shipmentsRes.error
      const myShipments = (shipmentsRes.data ?? []) as ShipmentOption[]
      setShipments(myShipments)

      // incidents_select (RLS) : can_access_shipment() couvre déjà le
      // propriétaire du colis — pas besoin de filtrer par shipment_id ici.
      const incidentsRes = await supabase
        .from('incidents')
        .select('id, shipment_id, type, description, status, created_at')
        .order('created_at', { ascending: false })
      if (incidentsRes.error) throw incidentsRes.error
      setIncidents((incidentsRes.data ?? []) as Incident[])
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function trackingCode(id: string) {
    return shipments.find((s) => s.id === id)?.tracking_code ?? id
  }

  async function handleCreate() {
    if (!shipmentId) return
    setSubmitting(true)
    setMsg(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const { error } = await supabase.from('incidents').insert({
        shipment_id: shipmentId,
        type,
        description: description.trim() || null,
        reported_by: user.id,
        role: 'client',
      })
      if (error) throw error
      setMsg({ text: 'Incident signalé.', type: 'ok' })
      setShipmentId('')
      setDescription('')
      load()
    } catch (e) {
      setMsg({ text: messageErreur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/client" style={styles.retour}>
          ← Espace client
        </Link>
        <h1 style={styles.titre}>Incidents</h1>
        <p style={styles.soustitre}>Signale un problème sur l&apos;un de tes colis.</p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger tes incidents pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && shipments.length > 0 && (
        <div style={styles.createBox}>
          <div style={styles.createTitre}>Signaler un incident</div>
          <select style={styles.select} value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
            <option value="">Colis concerné…</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tracking_code}
              </option>
            ))}
          </select>
          <select style={styles.select} value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {INCIDENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <textarea
            style={styles.textarea}
            placeholder="Description (optionnelle)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button style={styles.bouton} disabled={!shipmentId || submitting} onClick={handleCreate}>
            {submitting ? 'Envoi…' : 'Signaler'}
          </button>
        </div>
      )}

      {!loading && !erreur && incidents.length === 0 && <p style={styles.vide}>Aucun incident.</p>}

      <div style={styles.list}>
        {incidents.map((i) => (
          <div key={i.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{trackingCode(i.shipment_id)}</span>
              <span style={styles.badge}>{INCIDENT_STATUS_LABELS[i.status]}</span>
            </div>
            <div style={styles.route}>{INCIDENT_TYPE_LABELS[i.type]}</div>
            {i.description && <div style={styles.desc}>{i.description}</div>}
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
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  createBox: {
    border: '1px dashed #C9C0AE', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: '#fff',
  },
  createTitre: { fontWeight: 700, fontSize: 13.5, color: '#0A1A0F' },
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5 },
  textarea: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5, minHeight: 70, fontFamily: 'inherit' },
  bouton: { padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FFF6DE', color: '#8A5A00' },
  route: { fontSize: 13, color: '#3D3D3D' },
  desc: { fontSize: 12.5, color: '#6A8572' },
}
