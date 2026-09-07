'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  SHIPMENT_STATUS_LABELS,
  STATUSES_REQUIRING_PROOF,
  type ShipmentStatus,
} from '@/lib/shipment-status'

type Shipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  origin_city: string
  destination_city: string
}

// Sous-ensemble de is_valid_transition() (Migration 1) réellement atteignable
// par le rôle transporteur en pratique aujourd'hui (is_role_status_allowed()
// autorise aussi 'out_for_delivery', mais aucune arête de is_valid_transition()
// n'y mène depuis un statut transporteur réel -- seul 'at_pickup_point' le
// permet, un statut agent point relais).
const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  departed_origin: 'in_transit_international',
  in_transit_international: 'customs_clearance',
  customs_clearance: 'arrived_destination',
}

export default function ScansPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      // RLS (shipments_client_select, Migration 1) ne renvoie déjà que les
      // colis assignés au transporteur connecté -- pas de filtre client-side
      // supplémentaire nécessaire.
      const { data, error } = await supabase
        .from('shipments')
        .select('id, tracking_code, status, origin_city, destination_city')
        .in('status', [
          'departed_origin',
          'in_transit_international',
          'customs_clearance',
          'arrived_destination',
        ])
        .order('created_at', { ascending: true })

      if (error) throw error
      setShipments((data ?? []) as Shipment[])
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdvance(shipment: Shipment) {
    const next = NEXT_STATUS[shipment.status]
    if (!next) return

    setSubmitting(shipment.id)
    setMsg(null)

    const { error } = await supabase.rpc('record_shipment_event', {
      p_shipment_id: shipment.id,
      p_new_status: next,
      p_acting_role: 'transporteur',
    })

    setSubmitting(null)

    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }

    setMsg({ text: `${shipment.tracking_code} → ${SHIPMENT_STATUS_LABELS[next]}`, type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Scans</h1>
        <p style={styles.soustitre}>
          Enregistre un événement de transit réel via record_shipment_event()
          (Migration 1). Un seul acteur (SECURITY DEFINER) valide le rôle,
          l&apos;affiliation et la transition côté base -- rien n&apos;est
          simulé ici.
        </p>
      </div>

      {msg && (
        <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>
      )}

      {loading && <p style={styles.vide}>Chargement…</p>}

      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les colis pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && shipments.length === 0 && (
        <p style={styles.vide}>
          Aucun colis actionnable actuellement. (Rappel : la visibilité d&apos;un
          colis pas encore pris en charge -- statut &quot;inspected&quot; sans
          transporteur assigné -- n&apos;est pas exposée par la RLS actuelle à un
          transporteur ; seuls les colis déjà affectés à ta fiche transporteur
          apparaissent ici.)
        </p>
      )}

      <div style={styles.list}>
        {shipments.map((s) => {
          const next = NEXT_STATUS[s.status]
          const proofRequired = next ? STATUSES_REQUIRING_PROOF.includes(next) : false
          return (
            <div key={s.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{s.tracking_code}</span>
                <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[s.status]}</span>
              </div>
              <div style={styles.route}>
                {s.origin_city} → {s.destination_city}
              </div>

              {next ? (
                proofRequired ? (
                  <div style={styles.disabledNote}>
                    📷 Preuve photo requise pour passer à « {SHIPMENT_STATUS_LABELS[next]} » --
                    l&apos;upload vers Supabase Storage n&apos;est pas encore câblé dans ce
                    scaffold (voir README « Hors périmètre »). Action indisponible pour
                    l&apos;instant.
                  </div>
                ) : (
                  <button
                    style={styles.bouton}
                    disabled={submitting === s.id}
                    onClick={() => handleAdvance(s)}
                  >
                    {submitting === s.id
                      ? 'Enregistrement…'
                      : `Enregistrer : ${SHIPMENT_STATUS_LABELS[next]}`}
                  </button>
                )
              ) : (
                <div style={styles.termine}>Aucune action transporteur supplémentaire.</div>
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
  titre: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 900,
    margin: '8px 0 4px',
  },
  soustitre: { color: '#3D3D3D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: {
    padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14,
  },
  msgOk: {
    padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A',
    fontSize: 13, marginBottom: 16,
  },
  msgErr: {
    padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A',
    fontSize: 13, marginBottom: 16,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#FFF6DE', color: '#8A5A00',
  },
  route: { fontSize: 13, color: '#3D3D3D' },
  bouton: {
    padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  disabledNote: {
    fontSize: 12.5, color: '#8A5A00', background: '#FFF6DE', borderRadius: 8,
    padding: '10px 12px', lineHeight: 1.5,
  },
  termine: { fontSize: 12.5, color: '#6A8572' },
}
