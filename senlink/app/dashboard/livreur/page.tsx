'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, SERVICE_TYPE_LABELS, type ShipmentStatus, type ServiceType } from '@/lib/shipment-status'
import { QrScanner } from '@/components/QrScanner'
import { StatusBadge } from '@/components/StatusBadge'
import { color, shared } from '@/lib/theme'

type LookedUpShipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  service_type: ServiceType
  sender_name: string
  sender_phone: string
  sender_address: string | null
  recipient_name: string
  recipient_phone: string
  recipient_address: string | null
  origin_city: string
  destination_city: string
  assigned_courier_user_id: string | null
  current_pickup_point_id: string | null
  current_hub_id: string | null
  assigned_transporter_id: string | null
}

type MesColis = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  recipient_name: string
  destination_city: string
}

type Action = 'dropped_off' | 'out_for_delivery' | 'at_pickup_point' | 'delivered'

const ACTION_LABEL: Record<Action, string> = {
  dropped_off: 'Confirmer la prise en charge',
  out_for_delivery: 'Partir en livraison',
  at_pickup_point: 'Destinataire absent → point relais',
  delivered: 'Confirmer la livraison',
}

// Statuts pour lesquels une preuve photo est exigée par record_shipment_event
// (voir migration 20260924100000) — inchangé pour la branche livreur :
// dropped_off et at_pickup_point l'exigent, out_for_delivery non.
const REQUIRES_PHOTO: Action[] = ['dropped_off', 'at_pickup_point', 'delivered']

function actionsFor(shipment: LookedUpShipment, myUserId: string): Action[] {
  const mine = shipment.assigned_courier_user_id === myUserId
  const unclaimed = shipment.assigned_courier_user_id === null

  if (shipment.status === 'created' && unclaimed) return ['dropped_off']
  if (shipment.status === 'at_hub' && (unclaimed || mine)) return ['out_for_delivery']
  if (!mine) return []
  if (shipment.status === 'dropped_off') return ['out_for_delivery']
  if (shipment.status === 'out_for_delivery') return ['delivered', 'at_pickup_point']
  if (shipment.status === 'at_pickup_point') return ['delivered']
  return []
}

export default function DashboardLivreurPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [erreurInit, setErreurInit] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [shipment, setShipment] = useState<LookedUpShipment | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState<Action | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingAction = useRef<Action | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedRef, setScannedRef] = useState<string | null>(null)

  const [mesColis, setMesColis] = useState<MesColis[]>([])

  async function chargerMesColis(userId: string) {
    const { data } = await supabase
      .from('shipments')
      .select('id, tracking_code, status, recipient_name, destination_city')
      .eq('assigned_courier_user_id', userId)
      .not('status', 'in', '(delivered,cancelled)')
    setMesColis((data ?? []) as MesColis[])
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreurInit(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')
        setMyUserId(user.id)
        await chargerMesColis(user.id)
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
    const { data, error } = await supabase.rpc('livreur_lookup_shipment', { p_tracking_code: searched })
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

  function startAction(action: Action) {
    if (!REQUIRES_PHOTO.includes(action)) {
      handleConfirm(action, null)
      return
    }
    pendingAction.current = action
    fileInput.current?.click()
  }

  async function handleConfirm(action: Action, file: File | null) {
    if (!shipment) return
    setSubmitting(action)
    setMsg(null)
    try {
      let photoUrl: string | null = null
      if (file) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${shipment.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('shipment-proofs')
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        const { data: publicUrlData } = supabase.storage.from('shipment-proofs').getPublicUrl(path)
        photoUrl = publicUrlData.publicUrl
      }

      const { error } = await supabase.rpc('record_shipment_event', {
        p_shipment_id: shipment.id,
        p_new_status: action,
        p_acting_role: 'livreur',
        p_photo_url: photoUrl,
        p_qr_scan_ref: scannedRef === shipment.tracking_code ? scannedRef : null,
        p_otp: action === 'delivered' ? otp.trim() : null,
      })
      if (error) throw error

      setMsg({ text: `${shipment.tracking_code} → ${SHIPMENT_STATUS_LABELS[action]}`, type: 'ok' })
      setShipment(null)
      setCode('')
      setOtp('')
      setScannedRef(null)
      if (myUserId) await chargerMesColis(myUserId)
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(null)
    }
  }

  const actions = shipment && myUserId ? actionsFor(shipment, myUserId) : []

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard" style={styles.retour}>
          ← Tableau de bord
        </Link>
        <h1 style={styles.titre}>Livraison</h1>
        <p style={styles.soustitre}>
          Cherche le colis par son code de suivi, ou scanne son QR, pour
          confirmer la prise en charge, le départ en livraison ou la remise
          au destinataire.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreurInit && <div style={styles.erreur}>{erreurInit}</div>}

      {!loading && !erreurInit && (
        <>
          <div style={styles.searchBox}>
            <input
              style={styles.input}
              placeholder="Code de suivi (ex : SL-SN-SN-847291)"
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

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              const action = pendingAction.current
              pendingAction.current = null
              if (file && action) handleConfirm(action, file)
            }}
          />

          {shipment && (
            <div className="sl-fade-in" style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{shipment.tracking_code}</span>
                <StatusBadge status={shipment.status} size="sm" />
              </div>
              <div style={styles.route}>
                {shipment.origin_city} → {shipment.destination_city} ·{' '}
                {SERVICE_TYPE_LABELS[shipment.service_type]}
              </div>
              <div style={styles.meta}>Expéditeur : {shipment.sender_name} · {shipment.sender_phone}</div>
              {shipment.sender_address && <div style={styles.meta}>Récupération : {shipment.sender_address}</div>}
              <div style={styles.meta}>Destinataire : {shipment.recipient_name} · {shipment.recipient_phone}</div>
              {shipment.recipient_address && <div style={styles.meta}>Livraison : {shipment.recipient_address}</div>}

              {actions.length > 0 ? (
                <>
                  {actions.includes('delivered') && (
                    <input
                      style={styles.input}
                      placeholder="Code de retrait donné par le destinataire"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                    />
                  )}
                  <div style={styles.actionsRow}>
                    {actions.map((action) => (
                      <button
                        key={action}
                        style={action === 'at_pickup_point' ? styles.boutonSecondaire : styles.bouton}
                        disabled={submitting !== null || (action === 'delivered' && !otp.trim())}
                        onClick={() => startAction(action)}
                      >
                        {submitting === action
                          ? 'Envoi…'
                          : `${REQUIRES_PHOTO.includes(action) ? '📷 ' : ''}${ACTION_LABEL[action]}`}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={styles.blocage}>
                  {shipment.assigned_courier_user_id && shipment.assigned_courier_user_id !== myUserId
                    ? 'Ce colis est déjà pris en charge par un autre livreur.'
                    : `Aucune action disponible ici pour ce colis à cet état (${SHIPMENT_STATUS_LABELS[shipment.status]}).`}
                </div>
              )}
            </div>
          )}

          <div style={styles.sousTitre}>Mes colis en cours</div>
          {mesColis.length === 0 && <p style={styles.vide}>Aucun colis en cours.</p>}
          <div style={styles.list}>
            {mesColis.map((s) => (
              <button key={s.id} style={styles.cardMini} onClick={() => handleSearch(s.tracking_code)}>
                <span style={styles.code}>{s.tracking_code}</span>
                <StatusBadge status={s.status} size="sm" />
              </button>
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
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
    ...shared.card, padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: color.inkStrong },
  route: { fontSize: 13, color: color.muted },
  meta: { fontSize: 12.5, color: color.muted },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  blocage: {
    fontSize: 12.5, color: '#8A6100', background: color.goldTint, borderRadius: 8,
    padding: '10px 12px', lineHeight: 1.5,
  },
  sousTitre: { fontSize: 12, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 10px' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
}
