import { messageUtilisateur } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'
import { ShipmentQrCode } from '@/components/ShipmentQrCode'
import { StatusBadge } from '@/components/StatusBadge'
import { ShipmentTimeline } from '@/components/ShipmentTimeline'
import { color, shared } from '@/lib/theme'

type TrackingRow = {
  tracking_code: string
  status: ShipmentStatus
  origin_city: string
  destination_city: string
  created_at: string
  event_type: string | null
  event_location: string | null
  event_created_at: string | null
  delivery_otp: string | null
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
    erreur = messageUtilisateur(e)
  }

  if (erreur) {
    return (
      <main style={shared.page}>
        <div style={styles.erreur}>Action non disponible pour le moment. Réessayez dans un instant.</div>
      </main>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <main style={{ ...shared.page, maxWidth: 640 }}>
        <p style={styles.vide}>
          Aucun colis trouvé pour le code <strong>{params.code}</strong>.
        </p>
      </main>
    )
  }

  const shipment = rows[0]
  const historique = rows.filter((r) => r.event_type !== null)

  return (
    <main style={{ ...shared.page, maxWidth: 640 }}>
      <div className="sl-fade-in" style={styles.entete}>
        <div>
          <p style={styles.kicker}>Suivi de colis</p>
          <h1 style={{ ...shared.titre, fontSize: 26, margin: '0 0 8px' }}>{shipment.tracking_code}</h1>
          <p style={styles.trajet}>
            {shipment.origin_city.toUpperCase()} → {shipment.destination_city.toUpperCase()}
          </p>
        </div>
        <StatusBadge status={shipment.status} />
      </div>

      <div className="sl-fade-in" style={{ ...shared.card, padding: 24, marginBottom: 24 }}>
        <div style={styles.sousTitre}>Progression</div>
        <ShipmentTimeline currentStatus={shipment.status} events={historique} />
      </div>

      <div className="sl-fade-in" style={styles.qrBox}>
        <ShipmentQrCode value={shipment.tracking_code} size={140} />
        <p style={styles.qrHelp}>
          Présentez ce QR au point relais lors du dépôt ou du retrait — il
          contient votre code de suivi.
        </p>
      </div>

      {shipment.delivery_otp && (
        <div className="sl-fade-in" style={styles.otpBox}>
          <div style={styles.otpLabel}>Code de retrait</div>
          <div style={styles.otpCode}>{shipment.delivery_otp}</div>
          <p style={styles.otpHelp}>
            Présentez ce code au point relais pour récupérer votre colis.
            Ne le communiquez à personne d&apos;autre.
          </p>
        </div>
      )}

      <div style={styles.sousTitre}>Historique détaillé</div>
      {historique.length === 0 ? (
        <p style={styles.vide}>Aucun événement enregistré pour l&apos;instant.</p>
      ) : (
        <ul style={styles.liste}>
          {historique.map((event, i) => (
            <li key={i} style={styles.ligne}>
              <div style={styles.ligneType}>
                {SHIPMENT_STATUS_LABELS[event.event_type as ShipmentStatus] ?? event.event_type}
              </div>
              {event.event_location && <div style={styles.ligneLoc}>{event.event_location}</div>}
              {event.event_created_at && (
                <div style={styles.ligneDate}>{new Date(event.event_created_at).toLocaleString('fr-FR')}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  entete: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  kicker: { fontSize: 11.5, fontWeight: 700, color: color.green600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' },
  trajet: { color: color.muted, fontSize: 14.5, margin: 0, fontWeight: 600 },
  otpBox: {
    padding: '20px 24px', borderRadius: 16, background: `linear-gradient(135deg, ${color.green900}, ${color.green800})`,
    color: '#fff', marginBottom: 24, textAlign: 'center',
  },
  otpLabel: {
    fontSize: 12, fontWeight: 700, color: color.gold, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 8,
  },
  otpCode: {
    fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 900,
    letterSpacing: 4,
  },
  otpHelp: { fontSize: 12.5, color: '#C9D6CE', marginTop: 10, lineHeight: 1.5 },
  qrBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: 20, borderRadius: 16, marginBottom: 24, ...shared.card,
  },
  qrHelp: { fontSize: 12.5, color: color.muted, textAlign: 'center', margin: 0, lineHeight: 1.5 },
  sousTitre: { fontSize: 12, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  liste: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  ligne: { ...shared.card, padding: '12px 16px' },
  ligneType: { fontWeight: 700, fontSize: 14, color: color.inkStrong },
  ligneLoc: { fontSize: 13, color: color.muted, marginTop: 2 },
  ligneDate: { fontSize: 11.5, color: color.muted, marginTop: 2 },
  vide: { color: color.muted, fontSize: 15 },
  erreur: {
    padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger,
    fontSize: 14,
  },
}
