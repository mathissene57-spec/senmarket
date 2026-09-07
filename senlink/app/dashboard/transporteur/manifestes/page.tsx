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

type Hub = { id: string; name: string; city: string }

type ManifestLine = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  recipient_name: string
  destination_city: string
}

export default function ManifestesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [selected, setSelected] = useState<string>('')
  const [lines, setLines] = useState<ManifestLine[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [loadingLines, setLoadingLines] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [lotsRes, hubsRes] = await Promise.all([
          supabase
            .from('shipment_lots')
            .select('id, lot_code, status, origin_hub_id, destination_hub_id')
            .order('created_at', { ascending: false }),
          supabase.from('hubs').select('id, name, city'),
        ])
        if (lotsRes.error) throw lotsRes.error
        if (hubsRes.error) throw hubsRes.error
        setLots((lotsRes.data ?? []) as Lot[])
        setHubs((hubsRes.data ?? []) as Hub[])
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  useEffect(() => {
    if (!selected) {
      setLines([])
      return
    }
    async function loadLines() {
      setLoadingLines(true)
      const { data, error } = await supabase
        .from('shipments')
        .select('id, tracking_code, status, recipient_name, destination_city')
        .eq('lot_id', selected)
      if (!error) setLines((data ?? []) as ManifestLine[])
      setLoadingLines(false)
    }
    loadLines()
  }, [selected, supabase])

  function hubLabel(id: string) {
    const h = hubs.find((h) => h.id === id)
    return h ? `${h.name} (${h.city})` : id
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Manifestes</h1>
        <p style={styles.soustitre}>
          Liste des colis d&apos;un lot (lecture seule) — utile comme
          bordereau de vérification à l&apos;enlèvement ou à la livraison.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les lots pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && lots.length === 0 && <p style={styles.vide}>Aucun lot pour le moment.</p>}

      {!loading && !erreur && lots.length > 0 && (
        <select style={styles.select} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choisir un lot…</option>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {lot.lot_code} — {LOT_STATUS_LABELS[lot.status]} — {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
            </option>
          ))}
        </select>
      )}

      {selected && loadingLines && <p style={styles.vide}>Chargement du manifeste…</p>}
      {selected && !loadingLines && lines.length === 0 && (
        <p style={styles.vide}>Ce lot ne contient aucun colis.</p>
      )}

      {selected && !loadingLines && lines.length > 0 && (
        <div style={styles.list}>
          {lines.map((l) => (
            <div key={l.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.code}>{l.tracking_code}</span>
                <span style={styles.badge}>{SHIPMENT_STATUS_LABELS[l.status]}</span>
              </div>
              <div style={styles.route}>
                {l.recipient_name} — {l.destination_city}
              </div>
            </div>
          ))}
        </div>
      )}
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
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5, marginBottom: 20, width: '100%' },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  badge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FFF6DE', color: '#8A5A00' },
  route: { fontSize: 13, color: '#3D3D3D' },
}
