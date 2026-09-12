'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'

type LookedUpShipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  sender_name: string
  sender_phone: string
  recipient_name: string
  recipient_phone: string
  origin_city: string
  destination_city: string
  current_pickup_point_id: string | null
  current_hub_id: string | null
  assigned_transporter_id: string | null
}

export default function HubPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [myHubId, setMyHubId] = useState<string | null>(null)
  const [erreurInit, setErreurInit] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [shipment, setShipment] = useState<LookedUpShipment | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreurInit(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')

        const { data, error } = await supabase
          .from('user_roles')
          .select('hub_id')
          .eq('user_id', user.id)
          .eq('role', 'agent_point_relais')
          .maybeSingle()
        if (error) throw error
        if (!data?.hub_id) {
          throw new Error("Ce compte n'est affecté à aucun hub.")
        }
        setMyHubId(data.hub_id)
      } catch (e) {
        setErreurInit(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch() {
    if (!code.trim()) return
    setSearching(true)
    setMsg(null)
    setShipment(null)
    const { data, error } = await supabase.rpc('agent_lookup_shipment', {
      p_tracking_code: code.trim(),
      p_acting_role: 'agent_point_relais',
    })
    setSearching(false)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    if (!data || data.length === 0) {
      setMsg({ text: 'Aucun colis trouvé pour ce code.', type: 'err' })
      return
    }
    setShipment(data[0] as LookedUpShipment)
  }

  async function handleConfirm() {
    if (!shipment) return
    setSubmitting(true)
    setMsg(null)
    const { error } = await supabase.rpc('record_shipment_event', {
      p_shipment_id: shipment.id,
      p_new_status: 'at_hub',
      p_acting_role: 'agent_point_relais',
    })
    setSubmitting(false)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: `${shipment.tracking_code} → ${SHIPMENT_STATUS_LABELS['at_hub']}`, type: 'ok' })
    setShipment(null)
    setCode('')
  }

  const canReceive = shipment ? shipment.status === 'arrived_destination' : false

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/agent" style={styles.retour}>
          ← Point relais
        </Link>
        <h1 style={styles.titre}>Réception hub</h1>
        <p style={styles.soustitre}>
          Confirme l&apos;arrivée d&apos;un colis à ce hub une fois déchargé
          du transport international.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreurInit && <div style={styles.erreur}>{erreurInit}</div>}

      {!loading && !erreurInit && (
        <>
          <div style={styles.searchBox}>
            <input
              style={styles.input}
              placeholder="Code de suivi (ex : SL-MA-SN-847291)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button style={styles.bouton} disabled={!code.trim() || searching} onClick={handleSearch}>
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>

          {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

          {shipment && (
            <div style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{shipment.tracking_code}</span>
                <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[shipment.status]}</span>
              </div>
              <div style={styles.route}>
                {shipment.origin_city} → {shipment.destination_city}
              </div>

              {canReceive ? (
                <button style={styles.bouton} disabled={submitting} onClick={handleConfirm}>
                  {submitting ? 'Confirmation…' : 'Confirmer la réception au hub'}
                </button>
              ) : (
                <div style={styles.blocage}>
                  Ce colis n&apos;est pas encore arrivé côté transport
                  international (statut actuel : {SHIPMENT_STATUS_LABELS[shipment.status]}).
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#E4F7EC', color: '#006B3C', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FBE7E8', color: '#E5484D', fontSize: 13, marginBottom: 16 },
  searchBox: { display: 'flex', gap: 8, marginBottom: 16 },
  input: { flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid #E7E1D3', fontSize: 14 },
  bouton: { padding: '12px 18px', borderRadius: 10, border: 'none', background: '#0B2418', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0B2418' },
  badge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FBF1DA', color: '#8A6100' },
  route: { fontSize: 13, color: '#66756D' },
  blocage: {
    fontSize: 12.5, color: '#8A6100', background: '#FBF1DA', borderRadius: 8,
    padding: '10px 12px', lineHeight: 1.5,
  },
}
