'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LiveMap } from '@/components/LiveMap'

type Location = {
  latitude: number
  longitude: number
  accuracy_m: number | null
  speed_kmh: number | null
  heading_degrees: number | null
  recorded_at: string
}

const RAFRAICHISSEMENT_MS = 15000

export default function ClientSuiviGpsPage() {
  const params = useParams<{ lotId: string }>()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<Location | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase.rpc('get_lot_last_location', { p_lot_id: params.lotId })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }
    setErreur(null)
    setLocation(data && data.length > 0 ? (data[0] as Location) : null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, RAFRAICHISSEMENT_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.lotId])

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/client/historique" style={styles.retour}>
          ← Historique
        </Link>
        <h1 style={styles.titre}>Où est mon colis ?</h1>
        <p style={styles.soustitre}>
          Position en direct du véhicule qui transporte ton colis — actualisée toutes les{' '}
          {RAFRAICHISSEMENT_MS / 1000} secondes.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger la position pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && !location && (
        <p style={styles.vide}>Aucune position reçue pour l&apos;instant — le transporteur n&apos;a pas encore démarré le suivi.</p>
      )}

      {location && (
        <>
          <div style={styles.carteWrap}>
            <LiveMap latitude={location.latitude} longitude={location.longitude} />
          </div>
          <div style={styles.details}>
            {location.speed_kmh != null && (
              <div style={styles.ligne}>
                <span style={styles.label}>Vitesse</span>
                <span>{Math.round(location.speed_kmh)} km/h</span>
              </div>
            )}
            <div style={styles.ligne}>
              <span style={styles.label}>Dernière mise à jour</span>
              <span>{new Date(location.recorded_at).toLocaleString('fr-FR')}</span>
            </div>
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
  carteWrap: { marginBottom: 16, overflow: 'hidden', borderRadius: 14, border: '1px solid #E7E1D3' },
  details: {
    border: '1px solid #E7E1D3', borderRadius: 12, padding: '4px 16px', background: '#fff',
  },
  ligne: {
    display: 'flex', justifyContent: 'space-between', padding: '10px 0',
    borderBottom: '1px solid #F1EEE7', fontSize: 13.5, color: '#66756D',
  },
  label: { color: '#66756D' },
}
