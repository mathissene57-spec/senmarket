'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, LOT_STATUS_LABELS, type ShipmentStatus, type LotStatus } from '@/lib/shipment-status'

export default function PerformancePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [shipmentCounts, setShipmentCounts] = useState<Record<string, number>>({})
  const [lotCounts, setLotCounts] = useState<Record<string, number>>({})
  const [incidentsOuverts, setIncidentsOuverts] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [shipmentsRes, lotsRes, incidentsRes] = await Promise.all([
          supabase.from('shipments').select('status'),
          supabase.from('shipment_lots').select('status'),
          supabase.from('incidents').select('id').eq('status', 'open'),
        ])
        if (shipmentsRes.error) throw shipmentsRes.error
        if (lotsRes.error) throw lotsRes.error
        if (incidentsRes.error) throw incidentsRes.error

        const sc: Record<string, number> = {}
        for (const row of (shipmentsRes.data ?? []) as { status: string }[]) {
          sc[row.status] = (sc[row.status] ?? 0) + 1
        }
        setShipmentCounts(sc)

        const lc: Record<string, number> = {}
        for (const row of (lotsRes.data ?? []) as { status: string }[]) {
          lc[row.status] = (lc[row.status] ?? 0) + 1
        }
        setLotCounts(lc)

        setIncidentsOuverts((incidentsRes.data ?? []).length)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  const totalShipments = Object.values(shipmentCounts).reduce((a, b) => a + b, 0)
  const totalLots = Object.values(lotCounts).reduce((a, b) => a + b, 0)

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Performance</h1>
        <p style={styles.soustitre}>
          Compteurs calculés en direct sur les colis et lots visibles pour ce
          compte (RLS) — aucune table de statistiques dédiée n&apos;existe
          côté SenLink pour l&apos;instant.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les statistiques pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && (
        <>
          <div style={styles.tuiles}>
            <div style={styles.tuile}>
              <div style={styles.tuileValeur}>{totalShipments}</div>
              <div style={styles.tuileLabel}>Colis</div>
            </div>
            <div style={styles.tuile}>
              <div style={styles.tuileValeur}>{totalLots}</div>
              <div style={styles.tuileLabel}>Lots</div>
            </div>
            <div style={styles.tuile}>
              <div style={styles.tuileValeur}>{incidentsOuverts}</div>
              <div style={styles.tuileLabel}>Incidents ouverts</div>
            </div>
          </div>

          <div style={styles.sousTitre}>Colis par statut</div>
          <div style={styles.list}>
            {Object.entries(shipmentCounts).map(([status, count]) => (
              <div key={status} style={styles.row}>
                <span>{SHIPMENT_STATUS_LABELS[status as ShipmentStatus] ?? status}</span>
                <span style={styles.rowCount}>{count}</span>
              </div>
            ))}
          </div>

          <div style={styles.sousTitre}>Lots par statut</div>
          <div style={styles.list}>
            {Object.entries(lotCounts).map(([status, count]) => (
              <div key={status} style={styles.row}>
                <span>{LOT_STATUS_LABELS[status as LotStatus] ?? status}</span>
                <span style={styles.rowCount}>{count}</span>
              </div>
            ))}
          </div>
        </>
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
  tuiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 },
  tuile: { border: '1px solid #E8E2D9', borderRadius: 14, padding: 16, textAlign: 'center', background: '#fff' },
  tuileValeur: { fontSize: 28, fontWeight: 900, color: '#0A1A0F' },
  tuileLabel: { fontSize: 12, color: '#6A8572', marginTop: 4 },
  sousTitre: { fontSize: 12, fontWeight: 700, color: '#6A8572', textTransform: 'uppercase', letterSpacing: 0.3, margin: '20px 0 8px' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex', justifyContent: 'space-between', fontSize: 13.5,
    border: '1px solid #E8E2D9', borderRadius: 10, padding: '10px 14px', background: '#fff',
  },
  rowCount: { fontWeight: 700, color: '#0A1A0F' },
}
