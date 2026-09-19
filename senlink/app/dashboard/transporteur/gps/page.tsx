'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Lot = { id: string; lot_code: string; origin_hub_id: string; destination_hub_id: string }
type Hub = { id: string; name: string; city: string }

const INTERVALLE_MIN_MS = 15000

export default function TransporteurGpsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurGps, setErreurGps] = useState<string | null>(null)
  const [dernierEnvoi, setDernierEnvoi] = useState<Record<string, string>>({})
  const lastSentAtRef = useRef<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const [lotsRes, hubsRes] = await Promise.all([
          supabase
            .from('shipment_lots')
            .select('id, lot_code, origin_hub_id, destination_hub_id')
            .eq('status', 'in_transit')
            .order('created_at', { ascending: false }),
          supabase.from('hubs').select('id, name, city'),
        ])
        if (lotsRes.error) throw lotsRes.error
        if (hubsRes.error) throw hubsRes.error
        setLots((lotsRes.data ?? []) as Lot[])
        setHubs((hubsRes.data ?? []) as Hub[])
      } catch (e) {
        setErreur(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  useEffect(() => {
    if (lots.length === 0) return
    if (!navigator.geolocation) {
      setErreurGps('La géolocalisation n’est pas disponible sur cet appareil.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setErreurGps(null)
        const { latitude, longitude, speed, heading, accuracy } = position.coords
        const now = Date.now()

        for (const lot of lots) {
          const last = lastSentAtRef.current[lot.id] ?? 0
          if (now - last < INTERVALLE_MIN_MS) continue
          lastSentAtRef.current[lot.id] = now

          supabase
            .rpc('record_lot_location', {
              p_lot_id: lot.id,
              p_latitude: latitude,
              p_longitude: longitude,
              p_acting_role: 'transporteur',
              p_accuracy_m: accuracy ?? null,
              p_speed_kmh: speed != null ? speed * 3.6 : null,
              p_heading_degrees: heading ?? null,
            })
            .then(({ error }) => {
              if (!error) {
                setDernierEnvoi((prev) => ({ ...prev, [lot.id]: new Date().toISOString() }))
              }
            })
        }
      },
      (err) => setErreurGps(`Position indisponible : ${err.message}`),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots])

  function hubLabel(id: string) {
    const h = hubs.find((h) => h.id === id)
    return h ? `${h.name} (${h.city})` : id
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Suivi GPS</h1>
        <p style={styles.soustitre}>
          Envoi automatique dès qu&apos;un de tes lots est en transit — laisse cette page ouverte
          pendant le trajet, aucune action à faire.
        </p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les lots en transit pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {erreurGps && <div style={styles.msgErr}>{erreurGps}</div>}
      {!loading && !erreur && lots.length === 0 && (
        <p style={styles.vide}>Aucun de tes lots n&apos;est actuellement en transit.</p>
      )}

      <div style={styles.list}>
        {lots.map((lot) => (
          <div key={lot.id} style={styles.card}>
            <div style={styles.code}>{lot.lot_code}</div>
            <div style={styles.route}>
              {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
            </div>
            <div style={styles.statut}>
              {dernierEnvoi[lot.id] ? (
                <>🟢 Position envoyée à {new Date(dernierEnvoi[lot.id]).toLocaleTimeString('fr-FR')}</>
              ) : erreurGps ? (
                '🔴 Suivi en pause'
              ) : (
                '🟡 En attente de la première position…'
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 560, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FBE7E8', color: '#E5484D', fontSize: 13, marginBottom: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
  },
  code: { fontWeight: 700, fontSize: 14, color: '#0B2418' },
  route: { fontSize: 13, color: '#66756D' },
  statut: { fontSize: 12.5, color: '#66756D', fontWeight: 600 },
}
