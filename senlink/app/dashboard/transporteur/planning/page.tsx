'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { LotStatus } from '@/lib/shipment-status'

type Lot = {
  id: string
  lot_code: string
  status: LotStatus
  created_at: string
  departed_at: string | null
  arrived_at: string | null
}

type Entry = { date: string; label: string; lotCode: string }

export default function PlanningPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const { data, error } = await supabase
          .from('shipment_lots')
          .select('id, lot_code, status, created_at, departed_at, arrived_at')
        if (error) throw error

        const lots = (data ?? []) as Lot[]
        const rows: Entry[] = []
        for (const lot of lots) {
          rows.push({ date: lot.created_at, label: 'Création', lotCode: lot.lot_code })
          if (lot.departed_at) rows.push({ date: lot.departed_at, label: 'Départ', lotCode: lot.lot_code })
          if (lot.arrived_at) rows.push({ date: lot.arrived_at, label: 'Arrivée', lotCode: lot.lot_code })
        }
        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setEntries(rows)
      } catch (e) {
        setErreur(messageErreur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  const groups: { day: string; items: Entry[] }[] = []
  for (const entry of entries) {
    const day = new Date(entry.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const group = groups.find((g) => g.day === day)
    if (group) group.items.push(entry)
    else groups.push({ day, items: [entry] })
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Planning</h1>
        <p style={styles.soustitre}>
          Agenda dérivé des dates réelles des lots (création, départ,
          arrivée) — lecture seule, aucune entrée manuelle.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger le planning pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && groups.length === 0 && (
        <p style={styles.vide}>Aucun lot pour le moment.</p>
      )}

      {!loading &&
        !erreur &&
        groups.map((g) => (
          <div key={g.day} style={styles.groupe}>
            <div style={styles.jour}>{g.day}</div>
            <div style={styles.list}>
              {g.items.map((item, i) => (
                <Link key={i} href="/dashboard/transporteur/lots" style={styles.item}>
                  <span style={styles.itemLabel}>{item.label}</span>
                  <span style={styles.itemCode}>{item.lotCode}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
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
  groupe: { marginBottom: 24 },
  jour: {
    fontSize: 12, fontWeight: 700, color: '#6A8572', textTransform: 'uppercase',
    letterSpacing: 0.3, marginBottom: 10,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', borderRadius: 10, border: '1px solid #E8E2D9',
    background: '#fff', textDecoration: 'none', color: '#0A1A0F', fontSize: 13.5,
  },
  itemLabel: { fontWeight: 600 },
  itemCode: { color: '#6A8572', fontSize: 12.5 },
}
