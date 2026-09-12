'use client'

import { messageUtilisateur } from '@/lib/errors'
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
  resolution_notes: string | null
  created_at: string
}

type ShipmentOption = { id: string; tracking_code: string }

const NEXT_STATUS: Record<IncidentStatus, IncidentStatus | null> = {
  open: 'investigating',
  investigating: 'resolved',
  resolved: 'closed',
  closed: null,
}

const NEXT_LABEL: Record<IncidentStatus, string> = {
  open: 'Marquer en cours de traitement',
  investigating: 'Marquer résolu',
  resolved: 'Clôturer',
  closed: '',
}

export default function AdminIncidentsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [incidentsRes, shipmentsRes] = await Promise.all([
        supabase
          .from('incidents')
          .select('id, shipment_id, type, description, status, resolution_notes, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('shipments').select('id, tracking_code'),
      ])
      if (incidentsRes.error) throw incidentsRes.error
      if (shipmentsRes.error) throw shipmentsRes.error
      setIncidents((incidentsRes.data ?? []) as Incident[])
      setShipments((shipmentsRes.data ?? []) as ShipmentOption[])
    } catch (e) {
      setErreur(messageUtilisateur(e))
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

  async function handleAdvance(incident: Incident) {
    const next = NEXT_STATUS[incident.status]
    if (!next) return
    setBusy(incident.id)
    setMsg(null)
    const update: Record<string, unknown> = { status: next }
    if (next === 'resolved') {
      update.resolution_notes = notes[incident.id]?.trim() || null
      update.resolved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('incidents').update(update).eq('id', incident.id)
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: `${trackingCode(incident.shipment_id)} → ${INCIDENT_STATUS_LABELS[next]}`, type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Incidents</h1>
        <p style={styles.soustitre}>
          Traite les incidents déclarés par les transporteurs, agents et
          clients — passage en cours de traitement, résolution, clôture.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les incidents pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && incidents.length === 0 && (
        <p style={styles.vide}>Aucun incident déclaré pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {incidents.map((i) => {
          const next = NEXT_STATUS[i.status]
          return (
            <div key={i.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{trackingCode(i.shipment_id)}</span>
                <span style={styles.badge}>{INCIDENT_STATUS_LABELS[i.status]}</span>
              </div>
              <div style={styles.route}>{INCIDENT_TYPE_LABELS[i.type]}</div>
              {i.description && <div style={styles.desc}>{i.description}</div>}
              {i.resolution_notes && (
                <div style={styles.resolutionNote}>Résolution : {i.resolution_notes}</div>
              )}

              {next === 'resolved' && i.status === 'investigating' && (
                <textarea
                  style={styles.textarea}
                  placeholder="Note de résolution (optionnelle)"
                  value={notes[i.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                />
              )}

              {next ? (
                <button style={styles.bouton} disabled={busy === i.id} onClick={() => handleAdvance(i)}>
                  {busy === i.id ? 'Mise à jour…' : NEXT_LABEL[i.status]}
                </button>
              ) : (
                <div style={styles.termine}>Incident clôturé.</div>
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
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#E4F7EC', color: '#006B3C', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FBE7E8', color: '#E5484D', fontSize: 13, marginBottom: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0B2418' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FBF1DA', color: '#8A6100',
  },
  route: { fontSize: 13, color: '#66756D' },
  desc: { fontSize: 12.5, color: '#66756D' },
  resolutionNote: { fontSize: 12.5, color: '#006B3C', fontStyle: 'italic' },
  textarea: {
    padding: '10px 12px', borderRadius: 8, border: '1px solid #E7E1D3',
    fontSize: 13.5, minHeight: 60, fontFamily: 'inherit',
  },
  bouton: {
    padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0B2418',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  termine: { fontSize: 12.5, color: '#66756D' },
}
