'use client'

import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvent } from 'react-leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'

const pin = (couleur: string) =>
  divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${couleur};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

type Point = { lat: number; lng: number; couleur: string }
type Coordonnees = { lat: number; lng: number }

function CadrerPoints({ points }: { points: Coordonnees[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 2) return
    map.fitBounds(latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [28, 28] })
  }, [map, points])
  return null
}

// Recupere le trajet routier reel (pas a vol d'oiseau) via le proxy OSRM
// (app/api/itineraire) des que depart/arrivee sont connus. Repli explicite
// sur `null` si le service echoue ou n'a pas encore repondu -- l'appelant
// trace alors la ligne droite entre les deux points, jamais de carte cassee.
function useTraceRoutier(trajet?: { depart: Coordonnees; arrivee: Coordonnees }) {
  const [trace, setTrace] = useState<Coordonnees[] | null>(null)
  const { depart, arrivee } = trajet || {}
  useEffect(() => {
    if (!depart || !arrivee) { setTrace(null); return }
    let annule = false
    const params = new URLSearchParams({
      depart_lat: String(depart.lat), depart_lng: String(depart.lng),
      arrivee_lat: String(arrivee.lat), arrivee_lng: String(arrivee.lng),
    })
    fetch(`/api/itineraire?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (!annule) setTrace(Array.isArray(data.points) ? data.points : null) })
      .catch(() => { if (!annule) setTrace(null) })
    return () => { annule = true }
  }, [depart?.lat, depart?.lng, arrivee?.lat, arrivee?.lng])
  return trace
}

// Mode "choisir sur la carte" (passager) : signale le centre courant a
// chaque deplacement/zoom -- le repere reste fixe au centre de l'ecran
// (superpose en CSS par le composant appelant), c'est la carte elle-meme
// qui bouge en dessous, comme dans les apps de VTC grand public.
function SignalerCentre({ onDeplacer }: { onDeplacer: (centre: { lat: number; lng: number }) => void }) {
  const map = useMapEvent('moveend', () => {
    const c = map.getCenter()
    onDeplacer({ lat: c.lat, lng: c.lng })
  })
  return null
}

export default function Carte({
  points, centre, zoom = 14, interactif = false, onDeplacer, trajet,
}: {
  points: Point[]
  centre?: [number, number]
  zoom?: number
  // interactif : autorise le glisser/zoomer (desactive par defaut partout
  // ailleurs -- carte purement visuelle). onDeplacer recoit le nouveau
  // centre a chaque arret de mouvement, utilise par le picker passager.
  interactif?: boolean
  onDeplacer?: (centre: { lat: number; lng: number }) => void
  // Trace toujours une ligne entre depart et arrivee quand une course est en
  // cours (passager et chauffeur), independamment des points/pastilles
  // affiches -- demande explicite : le trajet doit rester visuellement relie,
  // pas seulement deux repères isoles.
  trajet?: { depart: Coordonnees; arrivee: Coordonnees }
}) {
  const centreCarte: [number, number] = centre ?? [points[0]?.lat ?? 33.5731, points[0]?.lng ?? -7.5898]
  const traceRoutier = useTraceRoutier(trajet)
  // Trajet routier reel si le proxy OSRM a repondu, sinon ligne droite
  // depart-arrivee le temps de la reponse ou si le service est indisponible.
  const traceAffichee: Coordonnees[] | null = trajet
    ? (traceRoutier && traceRoutier.length > 1 ? traceRoutier : [trajet.depart, trajet.arrivee])
    : null
  const pointsCadrage: Coordonnees[] = traceAffichee ? [...points, ...traceAffichee] : points

  return (
    <MapContainer
      center={centreCarte}
      zoom={zoom}
      scrollWheelZoom={interactif}
      dragging={interactif}
      zoomControl={interactif}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {traceAffichee && (
        <Polyline
          positions={traceAffichee.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: '#101B3D', weight: 3, opacity: 0.6, dashArray: '2 10', lineCap: 'round' }}
        />
      )}
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pin(p.couleur)} />
      ))}
      <CadrerPoints points={pointsCadrage} />
      {interactif && onDeplacer && <SignalerCentre onDeplacer={onDeplacer} />}
    </MapContainer>
  )
}
