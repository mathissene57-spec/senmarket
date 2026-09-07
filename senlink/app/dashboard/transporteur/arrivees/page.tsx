'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LOT_STATUS_LABELS, type LotStatus } from '@/lib/shipment-status'

type Lot = {
  id: string
  lot_code: string
  status: LotStatus
  origin_hub_id: string
  destination_hub_id: string
}

type Hub = { id: string; name: string; city: string }

type Reconciliation = { attendu: number; recu: number; ecart: number }

export default function ArriveesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [reconciled, setReconciled] = useState<Record<string, Reconciliation>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [lotsRes, hubsRes] = await Promise.all([
        supabase
          .from('shipment_lots')
          .select('id, lot_code, status, origin_hub_id, destination_hub_id')
          .in('status', ['in_transit', 'arrived'])
          .order('created_at', { ascending: false }),
        supabase.from('hubs').select('id, name, city'),
      ])
      if (lotsRes.error) throw lotsRes.error
      if (hubsRes.error) throw hubsRes.error
      const lotsData = (lotsRes.data ?? []) as Lot[]
      setLots(lotsData)
      setHubs((hubsRes.data ?? []) as Hub[])

      const arrivedLots = lotsData.filter((l) => l.status === 'arrived')
      const results: Record<string, Reconciliation> = {}
      for (const lot of arrivedLots) {
        const { data, error } = await supabase.rpc('get_lot_reconciliation', { p_lot_id: lot.id })
        if (!error && data && data.length > 0) {
          results[lot.id] = data[0] as Reconciliation
        }
      }
      setReconciled(results)
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

  async function handleArrival(lotId: string) {
    setBusy(lotId)
    setMsg(null)
    const { error } = await supabase.rpc('declare_lot_arrival', {
      p_lot_id: lotId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Arrivée déclarée.', type: 'ok' })
    load()
  }

  async function handleReconcile(lotId: string) {
    setBusy(lotId)
    setMsg(null)
    const { error } = await supabase.rpc('record_lot_reconciliation', {
      p_lot_id: lotId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Réconciliation enregistrée.', type: 'ok' })
    load()
  }

  async function handleClose(lotId: string) {
    setBusy(lotId)
    setMsg(null)
    const { error } = await supabase.rpc('close_shipment_lot', {
      p_lot_id: lotId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Lot clôturé.', type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Arrivées</h1>
        <p style={styles.soustitre}>
          Cycle d&apos;arrivée d&apos;un lot (Migration 4) : déclarer
          l&apos;arrivée, réconcilier (compare colis attendus/reçus, ouvre un
          incident « colis manquant » par écart), puis clôturer.
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
      {!loading && !erreur && lots.length === 0 && (
        <p style={styles.vide}>Aucun lot en transit ou arrivé pour le moment.</p>
      )}

      <div style={styles.list}>
        {lots.map((lot) => {
          const rec = reconciled[lot.id]
          return (
            <div key={lot.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{lot.lot_code}</span>
                <span style={styles.badge}>{LOT_STATUS_LABELS[lot.status]}</span>
              </div>
              <div style={styles.route}>
                {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
              </div>

              {lot.status === 'in_transit' && (
                <button style={styles.bouton} disabled={busy === lot.id} onClick={() => handleArrival(lot.id)}>
                  {busy === lot.id ? 'Déclaration…' : 'Déclarer l’arrivée'}
                </button>
              )}

              {lot.status === 'arrived' && !rec && (
                <button style={styles.bouton} disabled={busy === lot.id} onClick={() => handleReconcile(lot.id)}>
                  {busy === lot.id ? 'Réconciliation…' : 'Réconcilier'}
                </button>
              )}

              {lot.status === 'arrived' && rec && (
                <>
                  <div style={styles.meta}>
                    Attendus : {rec.attendu} · Reçus : {rec.recu} · Écart : {rec.ecart}
                  </div>
                  <button style={styles.bouton} disabled={busy === lot.id} onClick={() => handleClose(lot.id)}>
                    {busy === lot.id ? 'Clôture…' : 'Clôturer le lot'}
                  </button>
                </>
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
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FFF6DE', color: '#8A5A00' },
  route: { fontSize: 13, color: '#3D3D3D' },
  meta: { fontSize: 12.5, color: '#6A8572' },
  bouton: { padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
}
