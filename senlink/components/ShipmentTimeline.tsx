import { SHIPMENT_STATUS_ORDER, type ShipmentStatus } from '@/lib/shipment-status'
import { color } from '@/lib/theme'

type TimelineEvent = {
  event_type: string | null
  event_location: string | null
  event_created_at: string | null
}

const STEPS = [
  { label: 'Déposé', statuses: ['dropped_off'] },
  { label: 'Contrôlé', statuses: ['inspected'] },
  { label: 'En transit', statuses: ['departed_origin', 'in_transit_international', 'customs_clearance'] },
  { label: 'Arrivé', statuses: ['arrived_destination', 'at_hub', 'at_pickup_point', 'out_for_delivery'] },
  { label: 'Livré', statuses: ['delivered'] },
] as const

function activeStepIndex(status: ShipmentStatus): number {
  return STEPS.findIndex((s) => (s.statuses as readonly string[]).includes(status))
}

export function ShipmentTimeline({
  currentStatus,
  events,
}: {
  currentStatus: ShipmentStatus
  events: TimelineEvent[]
}) {
  const current = activeStepIndex(currentStatus)
  // created (pas encore déposé) -> rien de franchi. incident/cancelled ->
  // hors flux linéaire, affiché ailleurs (badge de statut) plutôt que forcé
  // dans une étape qui ne le concerne pas.
  const horsFlux = currentStatus === 'incident' || currentStatus === 'cancelled'

  return (
    <div style={styles.wrapper}>
      {STEPS.map((step, i) => {
        const etat = horsFlux ? 'pending' : i < current ? 'done' : i === current ? 'current' : 'pending'
        const evenement = events.find((e) => e.event_type && (step.statuses as readonly string[]).includes(e.event_type))
        const dernier = i === STEPS.length - 1
        return (
          <div key={step.label} style={styles.etape}>
            <div style={styles.colonnePoint}>
              <div
                style={{
                  ...styles.point,
                  background: etat === 'pending' ? '#fff' : color.green400,
                  borderColor: etat === 'pending' ? color.border : color.green400,
                }}
                className={etat === 'current' ? 'sl-pulse' : undefined}
              />
              {!dernier && (
                <div
                  style={{
                    ...styles.trait,
                    background: etat === 'done' ? color.green400 : color.border,
                  }}
                />
              )}
            </div>
            <div style={styles.contenu}>
              <div style={{ ...styles.libelle, color: etat === 'pending' ? color.muted : color.inkStrong }}>
                {step.label}
              </div>
              {evenement?.event_location && <div style={styles.lieu}>{evenement.event_location}</div>}
              {evenement?.event_created_at && (
                <div style={styles.date}>
                  {new Date(evenement.event_created_at).toLocaleString('fr-FR')}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: { display: 'flex', flexDirection: 'column' },
  etape: { display: 'flex', gap: 16 },
  colonnePoint: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 },
  point: { width: 14, height: 14, borderRadius: '50%', border: '2px solid', flexShrink: 0, marginTop: 2 },
  trait: { width: 2, flex: 1, minHeight: 28 },
  contenu: { paddingBottom: 22 },
  libelle: { fontSize: 14.5, fontWeight: 700 },
  lieu: { fontSize: 12.5, color: color.muted, marginTop: 2 },
  date: { fontSize: 11.5, color: color.muted, marginTop: 1 },
}
