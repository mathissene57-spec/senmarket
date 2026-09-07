'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LOT_STATUS_LABELS, SHIPMENT_STATUS_LABELS, type LotStatus, type ShipmentStatus } from '@/lib/shipment-status'

type Lot = {
  id: string
  lot_code: string
  status: LotStatus
  origin_hub_id: string
  destination_hub_id: string
}

type Hub = { id: string; name: string; city: string; country: string }

type EligibleShipment = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  origin_country: string
  destination_country: string
}

export default function LotsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [eligible, setEligible] = useState<EligibleShipment[]>([])
  const [lotShipments, setLotShipments] = useState<Record<string, EligibleShipment[]>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [originHub, setOriginHub] = useState('')
  const [destHub, setDestHub] = useState('')

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [lotsRes, hubsRes, eligibleRes] = await Promise.all([
        supabase
          .from('shipment_lots')
          .select('id, lot_code, status, origin_hub_id, destination_hub_id')
          .order('created_at', { ascending: false }),
        supabase.from('hubs').select('id, name, city, country').eq('active', true),
        supabase
          .from('shipments')
          .select('id, tracking_code, status, origin_country, destination_country')
          .eq('status', 'inspected')
          .is('lot_id', null),
      ])
      if (lotsRes.error) throw lotsRes.error
      if (hubsRes.error) throw hubsRes.error
      if (eligibleRes.error) throw eligibleRes.error

      const lotsData = (lotsRes.data ?? []) as Lot[]
      setLots(lotsData)
      setHubs((hubsRes.data ?? []) as Hub[])
      setEligible((eligibleRes.data ?? []) as EligibleShipment[])

      const openLotIds = lotsData.filter((l) => l.status === 'open').map((l) => l.id)
      if (openLotIds.length > 0) {
        const { data: contentData, error: contentErr } = await supabase
          .from('shipments')
          .select('id, tracking_code, status, origin_country, destination_country, lot_id')
          .in('lot_id', openLotIds)
        if (contentErr) throw contentErr
        const grouped: Record<string, EligibleShipment[]> = {}
        for (const s of (contentData ?? []) as (EligibleShipment & { lot_id: string })[]) {
          if (!grouped[s.lot_id]) grouped[s.lot_id] = []
          grouped[s.lot_id].push(s)
        }
        setLotShipments(grouped)
      } else {
        setLotShipments({})
      }
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

  function hubLabel(id: string) {
    const h = hubs.find((h) => h.id === id)
    return h ? `${h.name} (${h.city})` : id
  }

  async function handleCreateLot() {
    if (!originHub || !destHub) return
    setBusy('create')
    setMsg(null)
    const { error } = await supabase.rpc('create_shipment_lot', {
      p_origin_hub_id: originHub,
      p_destination_hub_id: destHub,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Lot créé.', type: 'ok' })
    setOriginHub('')
    setDestHub('')
    load()
  }

  async function handleAdd(lotId: string, shipmentId: string) {
    setBusy(shipmentId)
    setMsg(null)
    const { error } = await supabase.rpc('add_shipment_to_lot', {
      p_lot_id: lotId,
      p_shipment_id: shipmentId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Colis ajouté au lot.', type: 'ok' })
    load()
  }

  async function handleRemove(lotId: string, shipmentId: string) {
    setBusy(shipmentId)
    setMsg(null)
    const { error } = await supabase.rpc('remove_shipment_from_lot', {
      p_lot_id: lotId,
      p_shipment_id: shipmentId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Colis retiré du lot.', type: 'ok' })
    load()
  }

  async function handleCancel(lotId: string) {
    setBusy(lotId)
    setMsg(null)
    const { error } = await supabase.rpc('cancel_empty_lot', {
      p_lot_id: lotId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Lot annulé.', type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Lots</h1>
        <p style={styles.soustitre}>
          Regroupe les colis prêts à être expédiés dans un même lot, pour un
          trajet donné. Le départ se déclare ensuite depuis « Départs ».
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les lots pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && (
        <div style={styles.createBox}>
          <div style={styles.createTitre}>Créer un lot</div>
          <select style={styles.select} value={originHub} onChange={(e) => setOriginHub(e.target.value)}>
            <option value="">Hub d&apos;origine…</option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.city}, {h.country})
              </option>
            ))}
          </select>
          <select style={styles.select} value={destHub} onChange={(e) => setDestHub(e.target.value)}>
            <option value="">Hub de destination…</option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.city}, {h.country})
              </option>
            ))}
          </select>
          <button
            style={styles.bouton}
            disabled={!originHub || !destHub || busy === 'create'}
            onClick={handleCreateLot}
          >
            {busy === 'create' ? 'Création…' : 'Créer le lot'}
          </button>
        </div>
      )}

      {!loading && !erreur && lots.length === 0 && <p style={styles.vide}>Aucun lot pour le moment.</p>}

      <div style={styles.list}>
        {lots.map((lot) => (
          <div key={lot.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{lot.lot_code}</span>
              <span style={styles.badge}>{LOT_STATUS_LABELS[lot.status]}</span>
            </div>
            <div style={styles.route}>
              {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
            </div>

            {lot.status === 'open' && (
              <>
                <div style={styles.sousTitreCard}>Colis dans ce lot</div>
                {(lotShipments[lot.id] ?? []).length === 0 && (
                  <div style={styles.videMini}>Aucun colis pour l&apos;instant.</div>
                )}
                {(lotShipments[lot.id] ?? []).map((s) => (
                  <div key={s.id} style={styles.shipmentRow}>
                    <span>{s.tracking_code}</span>
                    <button
                      style={styles.boutonMini}
                      disabled={busy === s.id}
                      onClick={() => handleRemove(lot.id, s.id)}
                    >
                      Retirer
                    </button>
                  </div>
                ))}

                <div style={styles.sousTitreCard}>Ajouter un colis contrôlé</div>
                {eligible.filter((s) => s.origin_country && s.destination_country).length === 0 && (
                  <div style={styles.videMini}>
                    Aucun colis disponible pour l&apos;instant. Les colis doivent
                    d&apos;abord être contrôlés avant de pouvoir être ajoutés à un lot.
                  </div>
                )}
                {eligible.map((s) => (
                  <div key={s.id} style={styles.shipmentRow}>
                    <span>
                      {s.tracking_code} ({SHIPMENT_STATUS_LABELS[s.status]})
                    </span>
                    <button style={styles.boutonMini} disabled={busy === s.id} onClick={() => handleAdd(lot.id, s.id)}>
                      Ajouter
                    </button>
                  </div>
                ))}

                {(lotShipments[lot.id] ?? []).length === 0 && (
                  <button style={styles.boutonDanger} disabled={busy === lot.id} onClick={() => handleCancel(lot.id)}>
                    Annuler ce lot (vide)
                  </button>
                )}
              </>
            )}
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
  videMini: { color: '#6A8572', fontSize: 12.5 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  createBox: {
    border: '1px dashed #C9C0AE', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: '#fff',
  },
  createTitre: { fontWeight: 700, fontSize: 13.5, color: '#0A1A0F' },
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FFF6DE', color: '#8A5A00' },
  route: { fontSize: 13, color: '#3D3D3D' },
  sousTitreCard: { fontSize: 12, fontWeight: 700, color: '#6A8572', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  shipmentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 },
  bouton: { padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  boutonMini: { padding: '6px 10px', borderRadius: 8, border: '1px solid #0A1A0F', background: '#fff', color: '#0A1A0F', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  boutonDanger: { marginTop: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid #C41E3A', background: '#fff', color: '#C41E3A', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
}
