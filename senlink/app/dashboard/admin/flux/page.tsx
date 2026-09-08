'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'

type ShipmentRow = {
  origin_country: string
  destination_country: string
  status: ShipmentStatus
}

type FluxGroup = {
  route: string
  total: number
  parStatut: Partial<Record<ShipmentStatus, number>>
}

export default function AdminFluxPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [groupes, setGroupes] = useState<FluxGroup[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const { data, error } = await supabase
          .from('shipments')
          .select('origin_country, destination_country, status')
        if (error) throw error

        const rows = (data ?? []) as ShipmentRow[]
        const parRoute = new Map<string, FluxGroup>()
        for (const r of rows) {
          const route = `${r.origin_country} → ${r.destination_country}`
          const g = parRoute.get(route) ?? { route, total: 0, parStatut: {} }
          g.total += 1
          g.parStatut[r.status] = (g.parStatut[r.status] ?? 0) + 1
          parRoute.set(route, g)
        }
        setGroupes(Array.from(parRoute.values()).sort((a, b) => b.total - a.total))
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Flux Maroc/Sénégal</h1>
        <p style={styles.soustitre}>
          Répartition des colis par sens de trajet (pays d&apos;origine → pays
          de destination) et par statut.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger le flux pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && groupes.length === 0 && (
        <p style={styles.vide}>Aucun colis pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {groupes.map((g) => (
          <div key={g.route} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.route}>{g.route}</span>
              <span style={styles.total}>{g.total} colis</span>
            </div>
            <div style={styles.statuts}>
              {Object.entries(g.parStatut).map(([statut, n]) => (
                <span key={statut} style={styles.badge}>
                  {SHIPMENT_STATUS_LABELS[statut as ShipmentStatus] ?? statut} : {n}
                </span>
              ))}
            </div>
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
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  route: { fontWeight: 700, fontSize: 15, color: '#0A1A0F' },
  total: { fontSize: 13, color: '#00875A', fontWeight: 700 },
  statuts: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  badge: {
    fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
    background: '#FFF6DE', color: '#8A5A00',
  },
}
