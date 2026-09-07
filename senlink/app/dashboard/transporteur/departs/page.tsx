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

export default function DepartsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
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
          .eq('status', 'open')
          .order('created_at', { ascending: false }),
        supabase.from('hubs').select('id, name, city'),
      ])
      if (lotsRes.error) throw lotsRes.error
      if (hubsRes.error) throw hubsRes.error
      const lotsData = (lotsRes.data ?? []) as Lot[]
      setLots(lotsData)
      setHubs((hubsRes.data ?? []) as Hub[])

      if (lotsData.length > 0) {
        const { data: shipmentsData, error: shipErr } = await supabase
          .from('shipments')
          .select('lot_id')
          .in('lot_id', lotsData.map((l) => l.id))
        if (shipErr) throw shipErr
        const c: Record<string, number> = {}
        for (const row of (shipmentsData ?? []) as { lot_id: string }[]) {
          c[row.lot_id] = (c[row.lot_id] ?? 0) + 1
        }
        setCounts(c)
      } else {
        setCounts({})
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

  async function handleDepart(lotId: string) {
    setBusy(lotId)
    setMsg(null)
    const { error } = await supabase.rpc('declare_lot_departure', {
      p_lot_id: lotId,
      p_acting_role: 'transporteur',
    })
    setBusy(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Départ déclaré — tous les colis du lot passent en transit international.', type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Départs</h1>
        <p style={styles.soustitre}>
          Déclare le départ d&apos;un lot prêt — tous ses colis passent alors
          en transit international. Refusé si un colis n&apos;a pas encore
          été contrôlé ou si un incident bloquant est ouvert.
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
        <p style={styles.vide}>Aucun lot ouvert prêt à partir. Compose un lot depuis « Lots ».</p>
      )}

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
            <div style={styles.meta}>{counts[lot.id] ?? 0} colis dans ce lot</div>
            {(counts[lot.id] ?? 0) === 0 ? (
              <div style={styles.blocage}>
                🔒 Départ impossible — ce lot ne contient aucun colis. Ajoute
                au moins un colis contrôlé depuis « Lots » avant de déclarer
                le départ.
              </div>
            ) : (
              <button
                style={styles.bouton}
                disabled={busy === lot.id}
                onClick={() => handleDepart(lot.id)}
              >
                {busy === lot.id ? 'Déclaration…' : 'Déclarer le départ'}
              </button>
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
  blocage: {
    fontSize: 12.5, color: '#8A5A00', background: '#FFF6DE', borderRadius: 8,
    padding: '10px 12px', lineHeight: 1.5,
  },
}
