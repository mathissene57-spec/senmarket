'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'
import { QrScanner } from '@/components/QrScanner'
import { StatusBadge } from '@/components/StatusBadge'
import { color, shared } from '@/lib/theme'

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

type LocalShipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  recipient_name: string
  destination_city: string
}

type Action = 'dropped_off' | 'inspected' | 'delivered' | null

function nextAction(shipment: LookedUpShipment, myPickupPointId: string): Action {
  if (shipment.status === 'created') return 'dropped_off'
  if (shipment.current_pickup_point_id !== myPickupPointId) return null
  if (shipment.status === 'dropped_off') return 'inspected'
  if (shipment.status === 'at_pickup_point') return 'delivered'
  return null
}

const ACTION_LABEL: Record<Exclude<Action, null>, string> = {
  dropped_off: 'Confirmer le dépôt',
  inspected: 'Confirmer le contrôle',
  delivered: 'Confirmer le retrait',
}

export default function PointRelaisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [myPickupPointId, setMyPickupPointId] = useState<string | null>(null)
  const [erreurInit, setErreurInit] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [shipment, setShipment] = useState<LookedUpShipment | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedRef, setScannedRef] = useState<string | null>(null)

  const [ici, setIci] = useState<LocalShipment[]>([])

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
          .select('pickup_point_id')
          .eq('user_id', user.id)
          .eq('role', 'agent_point_relais')
          .maybeSingle()
        if (error) throw error
        if (!data?.pickup_point_id) {
          throw new Error("Ce compte n'est affecté à aucun point relais.")
        }
        setMyPickupPointId(data.pickup_point_id)

        const { data: iciData, error: iciError } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, recipient_name, destination_city')
          .eq('current_pickup_point_id', data.pickup_point_id)
        if (iciError) throw iciError
        setIci((iciData ?? []) as LocalShipment[])
      } catch (e) {
        setErreurInit(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(codeOverride?: string) {
    const searched = (codeOverride ?? code).trim()
    if (!searched) return
    setSearching(true)
    setMsg(null)
    setShipment(null)
    setOtp('')
    const { data, error } = await supabase.rpc('agent_lookup_shipment', {
      p_tracking_code: searched,
      p_acting_role: 'agent_point_relais',
    })
    setSearching(false)
    if (error) {
      setMsg({ text: messageUtilisateur(error), type: 'err' })
      return
    }
    if (!data || data.length === 0) {
      setMsg({ text: 'Aucun colis trouvé pour ce code.', type: 'err' })
      return
    }
    setShipment(data[0] as LookedUpShipment)
  }

  function handleScan(value: string) {
    setScanning(false)
    setCode(value)
    setScannedRef(value)
    handleSearch(value)
  }

  async function handleConfirm(action: Exclude<Action, null>, file: File) {
    if (!shipment) return
    setSubmitting(true)
    setMsg(null)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${shipment.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('shipment-proofs')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('shipment-proofs').getPublicUrl(path)

      const { error } = await supabase.rpc('record_shipment_event', {
        p_shipment_id: shipment.id,
        p_new_status: action,
        p_acting_role: 'agent_point_relais',
        p_photo_url: publicUrlData.publicUrl,
        p_qr_scan_ref: scannedRef === shipment.tracking_code ? scannedRef : null,
        p_otp: action === 'delivered' ? otp.trim() : null,
      })
      if (error) throw error

      setMsg({ text: `${shipment.tracking_code} → ${SHIPMENT_STATUS_LABELS[action]}`, type: 'ok' })
      setShipment(null)
      setCode('')
      setOtp('')
      setScannedRef(null)
      if (myPickupPointId) {
        const { data: iciData } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, recipient_name, destination_city')
          .eq('current_pickup_point_id', myPickupPointId)
        setIci((iciData ?? []) as LocalShipment[])
      }
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  const action = shipment && myPickupPointId ? nextAction(shipment, myPickupPointId) : null

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/agent" style={styles.retour}>
          ← Point relais
        </Link>
        <h1 style={styles.titre}>Dépôt · Contrôle · Retrait</h1>
        <p style={styles.soustitre}>
          Entre le code de suivi communiqué par le client pour agir sur son
          colis — dépôt, contrôle, ou retrait selon son état actuel.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreurInit && (
        <div style={styles.erreur}>
          {erreurInit}
        </div>
      )}

      {!loading && !erreurInit && (
        <>
          <div style={styles.searchBox}>
            <input
              style={styles.input}
              placeholder="Code de suivi (ex : SL-MA-SN-847291)"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setScannedRef(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button style={styles.bouton} disabled={!code.trim() || searching} onClick={() => handleSearch()}>
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
            <button style={styles.boutonSecondaire} onClick={() => setScanning(true)}>
              📷 Scanner
            </button>
          </div>

          {scanning && <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />}

          {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

          {shipment && (
            <div className="sl-fade-in" style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{shipment.tracking_code}</span>
                <StatusBadge status={shipment.status} size="sm" />
              </div>
              <div style={styles.route}>
                {shipment.origin_city} → {shipment.destination_city}
              </div>
              <div style={styles.meta}>Destinataire : {shipment.recipient_name} · {shipment.recipient_phone}</div>

              {action ? (
                <>
                  {action === 'delivered' && (
                    <input
                      style={styles.input}
                      placeholder="Code de retrait donné par le client"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                    />
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) handleConfirm(action, file)
                    }}
                  />
                  <button
                    style={styles.bouton}
                    disabled={submitting || (action === 'delivered' && !otp.trim())}
                    onClick={() => fileInput.current?.click()}
                  >
                    {submitting ? 'Envoi…' : `📷 ${ACTION_LABEL[action]}`}
                  </button>
                </>
              ) : (
                <div style={styles.blocage}>
                  {shipment.current_pickup_point_id && shipment.current_pickup_point_id !== myPickupPointId
                    ? 'Ce colis est affecté à un autre point relais.'
                    : `Aucune action disponible ici pour ce colis à cet état (${SHIPMENT_STATUS_LABELS[shipment.status]}).`}
                </div>
              )}
            </div>
          )}

          <div style={styles.sousTitre}>Colis actuellement à ce point relais</div>
          {ici.length === 0 && <p style={styles.vide}>Aucun colis pour l&apos;instant.</p>}
          <div style={styles.list}>
            {ici.map((s) => (
              <div key={s.id} style={styles.cardMini}>
                <span style={styles.code}>{s.tracking_code}</span>
                <StatusBadge status={s.status} size="sm" />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 5vw, 32px) clamp(16px, 4vw, 24px) 64px' },
  head: { marginBottom: 24 },
  retour: { color: color.green600, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, color: color.inkStrong, margin: '8px 0 4px' },
  soustitre: { color: color.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: color.muted, fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: color.greenTint, color: color.green600, fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: color.dangerTint, color: color.danger, fontSize: 13, marginBottom: 16 },
  searchBox: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  input: { ...shared.input, flex: 1, marginBottom: 10, minWidth: 180 },
  bouton: shared.boutonPrimaire,
  boutonSecondaire: shared.boutonSecondaire,
  card: { ...shared.card, padding: 16, marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 10 },
  cardMini: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    ...shared.card, padding: '10px 14px',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: color.inkStrong },
  route: { fontSize: 13, color: color.muted },
  meta: { fontSize: 12.5, color: color.muted },
  blocage: {
    fontSize: 12.5, color: '#8A6100', background: color.goldTint, borderRadius: 8,
    padding: '10px 12px', lineHeight: 1.5,
  },
  sousTitre: { fontSize: 12, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 10px' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
}
