'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Lot = { id: string; lot_code: string; origin_hub_id: string; destination_hub_id: string }
type Hub = { id: string; name: string; city: string }
type LastLocation = {
  latitude: number
  longitude: number
  speed_kmh: number | null
  recorded_at: string
}

const INTERVALLE_MS = 20000

export default function TransporteurGpsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState<Lot[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [selected, setSelected] = useState<string>('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [lastSent, setLastSent] = useState<LastLocation | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function hubLabel(id: string) {
    const h = hubs.find((h) => h.id === id)
    return h ? `${h.name} (${h.city})` : id
  }

  function envoyerPosition(lotId: string) {
    if (!navigator.geolocation) {
      setMsg({ text: 'La géolocalisation n’est pas disponible sur cet appareil.', type: 'err' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, speed, heading, accuracy } = position.coords
        const { error } = await supabase.rpc('record_lot_location', {
          p_lot_id: lotId,
          p_latitude: latitude,
          p_longitude: longitude,
          p_acting_role: 'transporteur',
          p_accuracy_m: accuracy ?? null,
          p_speed_kmh: speed != null ? speed * 3.6 : null,
          p_heading_degrees: heading ?? null,
        })
        if (error) {
          setMsg({ text: error.message, type: 'err' })
          return
        }
        setLastSent({
          latitude,
          longitude,
          speed_kmh: speed != null ? Math.round(speed * 3.6) : null,
          recorded_at: new Date().toISOString(),
        })
        setMsg(null)
      },
      (err) => {
        setMsg({ text: `Position indisponible : ${err.message}`, type: 'err' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function handleStart() {
    if (!selected) return
    setTracking(true)
    envoyerPosition(selected)
    intervalRef.current = setInterval(() => envoyerPosition(selected), INTERVALLE_MS)
  }

  function handleStop() {
    setTracking(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Suivi GPS</h1>
        <p style={styles.soustitre}>
          Partage ta position pendant le transport d&apos;un lot — visible en direct par
          l&apos;administration et les clients dont un colis voyage dans ce lot.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les lots en transit pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && lots.length === 0 && (
        <p style={styles.vide}>Aucun de tes lots n&apos;est actuellement en transit.</p>
      )}

      {!loading && !erreur && lots.length > 0 && (
        <div style={styles.card}>
          <select
            style={styles.select}
            value={selected}
            disabled={tracking}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choisir un lot en transit…</option>
            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lot_code} — {hubLabel(lot.origin_hub_id)} → {hubLabel(lot.destination_hub_id)}
              </option>
            ))}
          </select>

          {!tracking ? (
            <button style={styles.bouton} disabled={!selected} onClick={handleStart}>
              Démarrer le suivi
            </button>
          ) : (
            <button style={styles.boutonStop} onClick={handleStop}>
              Arrêter le suivi
            </button>
          )}

          {tracking && (
            <div style={styles.statut}>
              🟢 Suivi actif — position envoyée toutes les {INTERVALLE_MS / 1000} secondes.
            </div>
          )}

          {lastSent && (
            <div style={styles.derniere}>
              Dernière position envoyée : {lastSent.latitude.toFixed(5)}, {lastSent.longitude.toFixed(5)}
              {lastSent.speed_kmh != null && ` · ${lastSent.speed_kmh} km/h`}
              {' · '}
              {new Date(lastSent.recorded_at).toLocaleTimeString('fr-FR')}
            </div>
          )}
        </div>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 560, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#00875A', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 12, background: '#fff',
  },
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5 },
  bouton: { padding: '14px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  boutonStop: { padding: '14px 16px', borderRadius: 10, border: '1px solid #C41E3A', background: '#fff', color: '#C41E3A', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  statut: { fontSize: 12.5, color: '#00875A', fontWeight: 600 },
  derniere: { fontSize: 12, color: '#6A8572' },
}
