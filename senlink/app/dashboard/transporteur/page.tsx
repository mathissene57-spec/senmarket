'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LOT_STATUS_LABELS, SHIPMENT_STATUS_LABELS, type LotStatus, type ShipmentStatus } from '@/lib/shipment-status'
import { KpiCard } from '@/components/KpiCard'
import { CorridorVisual } from '@/components/CorridorVisual'
import { color, shared } from '@/lib/theme'
import { Package, Truck, AlertTriangle, CheckCircle2, Boxes, Gauge } from 'lucide-react'

// Écran "Accueil" (section 1 de docs/spec-role-transporteur.md) : vue
// d'ensemble en lecture seule, page d'atterrissage du rôle transporteur.
// Les 12 écrans réels restent accessibles via la grille de navigation
// rapide en bas de page — cette page ne fait que présenter les mêmes
// données différemment (cockpit visuel), aucune fonctionnalité retirée.

type ShipmentRow = {
  id: string
  tracking_code: string
  status: ShipmentStatus
  lot_id: string | null
  updated_at: string | null
}
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
          supabase.from('shipments').select('id, tracking_code, status, lot_id, updated_at'),
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
        setErreur(messageUtilisateur(e))
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

  const recents = [...shipments]
    .filter((s) => s.updated_at)
    .sort((a, b) => (b.updated_at! < a.updated_at! ? -1 : 1))
    .slice(0, 6)

  return (
    <main style={shared.page}>
      <p style={styles.kicker}>Espace transporteur</p>
      <h1 style={{ ...shared.titre, fontSize: 26, margin: '0 0 24px' }}>Cockpit opérationnel</h1>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}

      {!loading && !erreur && (
        <>
          <div style={styles.corridorSection}>
            <CorridorVisual
              stats={[
                { value: lotsEnTransport.length, label: 'Lots en transport' },
                { value: enTransit.length, label: 'Colis en transit' },
                { value: `${tauxLivraison}%`, label: 'Taux de livraison' },
              ]}
            />
          </div>

          <div style={styles.kpis}>
            <KpiCard icon={<Truck size={17} />} value={enTransit.length} label="En transit" accent="gold" />
            <KpiCard
              icon={<Boxes size={17} />}
              value={aPrendreEnCharge.length}
              label="À prendre en charge"
              accent="neutral"
            />
            <KpiCard icon={<Package size={17} />} value={lotsEnTransport.length} label="Lots en transport" accent="green" />
            <KpiCard
              icon={<AlertTriangle size={17} />}
              value={incidentsOuverts}
              label="Incidents ouverts"
              accent={incidentsOuverts > 0 ? 'danger' : 'neutral'}
            />
            <KpiCard icon={<CheckCircle2 size={17} />} value={livres.length} label="Colis livrés" accent="green" />
            <KpiCard icon={<Gauge size={17} />} value={`${tauxLivraison}%`} label="Taux de livraison" accent="gold" />
          </div>

          <div style={styles.colonnes}>
            <div style={styles.colonne}>
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
                      <Link href="/dashboard/transporteur/incidents" style={styles.todoItemDanger}>
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
            </div>

            <div style={styles.colonne}>
              <div style={styles.sousTitre}>Activité récente</div>
              {recents.length === 0 ? (
                <div style={styles.todoVide}>Aucun mouvement récent.</div>
              ) : (
                <div style={styles.activiteList}>
                  {recents.map((s) => (
                    <div key={s.id} style={styles.activiteItem}>
                      <span style={styles.activiteCode}>{s.tracking_code}</span>
                      <span style={styles.activiteStatut}>{SHIPMENT_STATUS_LABELS[s.status]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ ...styles.sousTitre, marginTop: 8 }}>Accès rapide</div>
      <div style={styles.grid}>
        {CARTES.map((c) => (
          <Link key={c.label} href={c.href} className="sl-card-hover" style={styles.carteLink}>
            {c.label}
          </Link>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  kicker: { fontSize: 12, fontWeight: 700, color: color.green600, textTransform: 'uppercase', letterSpacing: 1, margin: 0 },
  vide: { color: color.muted, fontSize: 14 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14, marginBottom: 24 },
  corridorSection: { marginBottom: 24 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 },
  colonnes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 32 },
  colonne: { display: 'flex', flexDirection: 'column' },
  sousTitre: {
    fontSize: 12, fontWeight: 700, color: color.muted, textTransform: 'uppercase',
    letterSpacing: 0.3, margin: '0 0 12px',
  },
  todoList: { display: 'flex', flexDirection: 'column', gap: 8 },
  todoVide: { fontSize: 13.5, color: color.muted, ...shared.card, padding: 16 },
  todoItem: {
    display: 'block', padding: '12px 14px', borderRadius: 10, background: color.goldTint,
    color: '#8A6100', fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
  },
  todoItemDanger: {
    display: 'block', padding: '12px 14px', borderRadius: 10, background: color.dangerTint,
    color: color.danger, fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
  },
  activiteList: { display: 'flex', flexDirection: 'column', gap: 6, ...shared.card, padding: 6 },
  activiteItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', borderRadius: 8, fontSize: 13,
  },
  activiteCode: { fontWeight: 700, color: color.inkStrong },
  activiteStatut: { color: color.muted, fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 },
  carteLink: {
    padding: '18px 16px', borderRadius: 12, background: color.green900,
    color: '#fff', fontWeight: 700, textAlign: 'center', textDecoration: 'none', fontSize: 13.5,
  },
}
