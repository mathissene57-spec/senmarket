import { createClient } from '@/lib/supabase/server'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'

type TrackingRow = {
  tracking_code: string
  status: ShipmentStatus
  origin_city: string
  destination_city: string
  created_at: string
  event_type: string | null
  event_location: string | null
  event_created_at: string | null
}

async function getTracking(code: string): Promise<TrackingRow[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_tracking', {
    p_tracking_code: code,
  })
  if (error || !data) return null
  return data as TrackingRow[]
}

export default async function SuiviPage({ params }: { params: { code: string } }) {
  let rows: TrackingRow[] | null = null
  let erreur: string | null = null

  try {
    rows = await getTracking(params.code)
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  if (erreur) {
    return (
      <main style={styles.page}>
        <div style={styles.erreur}>
          Impossible de charger le suivi pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      </main>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <main style={styles.page}>
        <p style={styles.vide}>
          Aucun colis trouvé pour le code <strong>{params.code}</strong>.
        </p>
      </main>
    )
  }

  const shipment = rows[0]
  const timeline = rows.filter((r) => r.event_type !== null)

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>{shipment.tracking_code}</h1>
      <p style={styles.trajet}>
        {shipment.origin_city} → {shipment.destination_city}
      </p>
      <div style={styles.statutBadge}>
        {SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}
      </div>

      <h2 style={styles.sousTitre}>Historique</h2>
      {timeline.length === 0 ? (
        <p style={styles.vide}>Aucun événement enregistré pour l&apos;instant.</p>
      ) : (
        <ul style={styles.timeline}>
          {timeline.map((event, i) => (
            <li key={i} style={styles.timelineItem}>
              <div style={styles.timelinePoint} />
              <div>
                <div style={styles.timelineType}>{event.event_type}</div>
                {event.event_location && (
                  <div style={styles.timelineLoc}>{event.event_location}</div>
                )}
                {event.event_created_at && (
                  <div style={styles.timelineDate}>
                    {new Date(event.event_created_at).toLocaleString('fr-FR')}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, margin: '0 0 4px' },
  trajet: { color: '#3D3D3D', fontSize: 15, margin: '0 0 16px' },
  statutBadge: {
    display: 'inline-block', padding: '8px 16px', borderRadius: 999,
    background: '#00C96B', color: '#0A1A0F', fontWeight: 700, fontSize: 14,
    marginBottom: 32,
  },
  sousTitre: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
  timeline: { listStyle: 'none', padding: 0, margin: 0 },
  timelineItem: { display: 'flex', gap: 12, marginBottom: 20 },
  timelinePoint: { width: 10, height: 10, borderRadius: '50%', background: '#00C96B', marginTop: 6, flexShrink: 0 },
  timelineType: { fontWeight: 700, fontSize: 14 },
  timelineLoc: { fontSize: 13, color: '#3D3D3D' },
  timelineDate: { fontSize: 12, color: '#8A8A8A' },
  vide: { color: '#3D3D3D', fontSize: 15 },
  erreur: {
    padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A',
    fontSize: 14,
  },
}
