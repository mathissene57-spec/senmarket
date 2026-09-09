'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LOT_STATUS_LABELS, type LotStatus, type ShipmentStatus } from '@/lib/shipment-status'

// Écran "Accueil" (section 1 de docs/spec-role-transporteur.md) : vue
// d'ensemble en lecture seule, page d'atterrissage du rôle transporteur.
// Les 8 écrans réels restent accessibles via la grille de navigation
// rapide en bas de page.

type ShipmentRow = { status: ShipmentStatus; lot_id: string | null }
type LotRow = { id: string; lot_code: string; status: LotStatus }

const EN_TRANSIT: ShipmentStatus[] = [
  'departed_origin',
  'in_transit_international',
  'customs_clearance',
  'arrived_destination',
  'at_hub',
  'at_pickup_point',
  'out_for_delivery',
]

const CARTES = [
  { label: 'Colis', href: '/dashboard/transporteur/colis' },
  { label: 'Lots', href: '/dashboard/transporteur/lots' },
  { label: 'Scans', href: '/dashboard/transporteur/scans' },
  { label: 'Suivi GPS', href: '/dashboard/transporteur/gps' },
  { label: 'Départs', href: '/dashboard/transporteur/departs' },
  { label: 'Arrivées', href: '/dashboard/transporteur/arrivees' },
  { label: 'Incidents', href: '/dashboard/transporteur/incidents' },
  { label: 'Manifestes', href: '/dashboard/transporteur/manifestes' },
  { label: 'Performance', href: '/dashboard/transporteur/performance' },
  { label: 'Planning', href: '/dashboard/transporteur/planning' },
  { label: 'Équipe', href: '/dashboard/transporteur/equipe' },
  { label: 'Profil', href: '/dashboard/transporteur/profil' },
]

export default function DashboardTransporteurPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [lots, setLots] = useState<LotRow[]>([])
  const [incidentsOuverts, setIncidentsOuverts] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [shipmentsRes, lotsRes, incidentsRes] = await Promise.all([
          supabase.from('shipments').select('status, lot_id'),
          supabase.from('shipment_lots').select('id, lot_code, status'),
          supabase.from('incidents').select('id').eq('status', 'open'),
        ])
        if (shipmentsRes.error) throw shipmentsRes.error
        if (lotsRes.error) throw lotsRes.error
        if (incidentsRes.error) throw incidentsRes.error

        setShipments((shipmentsRes.data ?? []) as ShipmentRow[])
        setLots((lotsRes.data ?? []) as LotRow[])
        setIncidentsOuverts((incidentsRes.data ?? []).length)
      } catch (e) {
        setErreur(messageErreur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  const aPrendreEnCharge = shipments.filter((s) => s.status === 'inspected' && !s.lot_id)
  const enTransit = shipments.filter((s) => EN_TRANSIT.includes(s.status))
  const livres = shipments.filter((s) => s.status === 'delivered')
  const totalPourTaux = shipments.filter((s) => s.status !== 'cancelled').length
  const tauxLivraison = totalPourTaux > 0 ? Math.round((livres.length / totalPourTaux) * 100) : 0
  const lotsEnTransport = lots.filter((l) => l.status === 'in_transit')
  const lotsOuverts = lots.filter((l) => l.status === 'open')

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Espace transporteur</h1>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger la vue d&apos;ensemble pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{enTransit.length}</div>
              <div style={styles.kpiLabel}>En transit</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{aPrendreEnCharge.length}</div>
              <div style={styles.kpiLabel}>À prendre en charge</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{lotsEnTransport.length}</div>
              <div style={styles.kpiLabel}>Lots en transport</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{incidentsOuverts}</div>
              <div style={styles.kpiLabel}>Incidents ouverts</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{livres.length}</div>
              <div style={styles.kpiLabel}>Colis livrés</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiValeur}>{tauxLivraison}%</div>
              <div style={styles.kpiLabel}>Taux de livraison</div>
            </div>
          </div>

          <div style={styles.sousTitre}>À faire maintenant</div>
          <div style={styles.todoList}>
            {aPrendreEnCharge.length === 0 && lotsOuverts.length === 0 && incidentsOuverts === 0 ? (
              <div style={styles.todoVide}>Rien à traiter pour l&apos;instant.</div>
            ) : (
              <>
                {aPrendreEnCharge.length > 0 && (
                  <Link href="/dashboard/transporteur/lots" style={styles.todoItem}>
                    {aPrendreEnCharge.length} colis contrôlé(s) à rattacher à un lot
                  </Link>
                )}
                {incidentsOuverts > 0 && (
                  <Link href="/dashboard/transporteur/incidents" style={styles.todoItem}>
                    {incidentsOuverts} incident(s) non traité(s)
                  </Link>
                )}
                {lotsOuverts.map((l) => (
                  <Link key={l.id} href="/dashboard/transporteur/departs" style={styles.todoItem}>
                    Lot {l.lot_code} ouvert — prêt pour le départ ?
                  </Link>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <div style={styles.sousTitre}>Accès rapide</div>
      <div style={styles.grid}>
        {CARTES.map((c) => (
          <Link key={c.label} href={c.href} style={styles.carteLink}>
            {c.label}
          </Link>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 800, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: '0 0 24px' },
  vide: { color: '#3D3D3D', fontSize: 14 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14, marginBottom: 24 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 28 },
  kpi: { border: '1px solid #E8E2D9', borderRadius: 14, padding: 16, textAlign: 'center', background: '#fff' },
  kpiValeur: { fontSize: 24, fontWeight: 900, color: '#0A1A0F' },
  kpiLabel: { fontSize: 11.5, color: '#6A8572', marginTop: 4 },
  sousTitre: { fontSize: 12, fontWeight: 700, color: '#6A8572', textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 10px' },
  todoList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 },
  todoVide: { fontSize: 13.5, color: '#6A8572' },
  todoItem: {
    display: 'block', padding: '12px 14px', borderRadius: 10, background: '#FFF6DE',
    color: '#8A5A00', fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  carteLink: {
    padding: 20, borderRadius: 12, background: '#0A1A0F', border: '1px solid #0A1A0F',
    color: '#fff', fontWeight: 700, textAlign: 'center', textDecoration: 'none',
  },
}
