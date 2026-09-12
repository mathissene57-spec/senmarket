'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SHIPMENT_STATUS_LABELS, INCIDENT_STATUS_LABELS, type ShipmentStatus, type IncidentStatus } from '@/lib/shipment-status'

type Stats = {
  totalColis: number
  parStatutColis: Partial<Record<ShipmentStatus, number>>
  totalIncidents: number
  parStatutIncidents: Partial<Record<IncidentStatus, number>>
  transporteursActifs: number
  transporteursTotal: number
  pointsRelaisActifs: number
  pointsRelaisTotal: number
}

export default function AdminAnalyticsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [colisRes, incidentsRes, transporteursRes, pointsRes] = await Promise.all([
          supabase.from('shipments').select('status'),
          supabase.from('incidents').select('status'),
          supabase.from('transporters').select('active'),
          supabase.from('pickup_points').select('active'),
        ])
        if (colisRes.error) throw colisRes.error
        if (incidentsRes.error) throw incidentsRes.error
        if (transporteursRes.error) throw transporteursRes.error
        if (pointsRes.error) throw pointsRes.error

        const parStatutColis: Partial<Record<ShipmentStatus, number>> = {}
        for (const row of colisRes.data ?? []) {
          const s = row.status as ShipmentStatus
          parStatutColis[s] = (parStatutColis[s] ?? 0) + 1
        }
        const parStatutIncidents: Partial<Record<IncidentStatus, number>> = {}
        for (const row of incidentsRes.data ?? []) {
          const s = row.status as IncidentStatus
          parStatutIncidents[s] = (parStatutIncidents[s] ?? 0) + 1
        }

        setStats({
          totalColis: colisRes.data?.length ?? 0,
          parStatutColis,
          totalIncidents: incidentsRes.data?.length ?? 0,
          parStatutIncidents,
          transporteursActifs: (transporteursRes.data ?? []).filter((t) => t.active).length,
          transporteursTotal: transporteursRes.data?.length ?? 0,
          pointsRelaisActifs: (pointsRes.data ?? []).filter((p) => p.active).length,
          pointsRelaisTotal: pointsRes.data?.length ?? 0,
        })
      } catch (e) {
        setErreur(messageUtilisateur(e))
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
        <h1 style={styles.titre}>Analytics</h1>
        <p style={styles.soustitre}>Vue d&apos;ensemble du réseau, calculée en direct.</p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les statistiques pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {stats && (
        <div style={styles.grid}>
          <div style={styles.stat}>
            <div style={styles.statValeur}>{stats.totalColis}</div>
            <div style={styles.statLabel}>Colis au total</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValeur}>{stats.totalIncidents}</div>
            <div style={styles.statLabel}>Incidents au total</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValeur}>
              {stats.transporteursActifs}/{stats.transporteursTotal}
            </div>
            <div style={styles.statLabel}>Transporteurs actifs</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValeur}>
              {stats.pointsRelaisActifs}/{stats.pointsRelaisTotal}
            </div>
            <div style={styles.statLabel}>Points relais actifs</div>
          </div>
        </div>
      )}

      {stats && (
        <>
          <h2 style={styles.sousTitre}>Colis par statut</h2>
          <div style={styles.repartition}>
            {Object.entries(stats.parStatutColis).map(([statut, n]) => (
              <div key={statut} style={styles.ligne}>
                <span>{SHIPMENT_STATUS_LABELS[statut as ShipmentStatus] ?? statut}</span>
                <span style={styles.ligneValeur}>{n}</span>
              </div>
            ))}
          </div>

          <h2 style={styles.sousTitre}>Incidents par statut</h2>
          <div style={styles.repartition}>
            {Object.entries(stats.parStatutIncidents).map(([statut, n]) => (
              <div key={statut} style={styles.ligne}>
                <span>{INCIDENT_STATUS_LABELS[statut as IncidentStatus] ?? statut}</span>
                <span style={styles.ligneValeur}>{n}</span>
              </div>
            ))}
            {stats.totalIncidents === 0 && <p style={styles.vide}>Aucun incident.</p>}
          </div>
        </>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 12, marginBottom: 32,
  },
  stat: {
    padding: '18px 16px', borderRadius: 14, background: '#0B2418', color: '#fff', textAlign: 'center',
  },
  statValeur: { fontSize: 24, fontWeight: 900, fontFamily: "'Playfair Display', serif" },
  statLabel: { fontSize: 11.5, color: '#C9D6CE', marginTop: 4 },
  sousTitre: { fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#0B2418' },
  repartition: {
    display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 28,
    border: '1px solid #E7E1D3', borderRadius: 12, padding: '4px 16px', background: '#fff',
  },
  ligne: {
    display: 'flex', justifyContent: 'space-between', padding: '10px 0',
    borderBottom: '1px solid #F1EEE7', fontSize: 13.5, color: '#66756D',
  },
  ligneValeur: { fontWeight: 700, color: '#0B2418' },
}
