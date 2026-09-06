'use client'

import { MapContainer, TileLayer, Marker, useMap, useMapEvent } from 'react-leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'

const pin = (couleur: string) =>
  divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${couleur};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

type Point = { lat: number; lng: number; couleur: string }

function CadrerPoints({ points }: { points: Point[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 2) return
    map.fitBounds(latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [28, 28] })
  }, [map, points])
  return null
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
  points, centre, zoom = 14, interactif = false, onDeplacer,
}: {
  points: Point[]
  centre?: [number, number]
  zoom?: number
  // interactif : autorise le glisser/zoomer (desactive par defaut partout
  // ailleurs -- carte purement visuelle). onDeplacer recoit le nouveau
  // centre a chaque arret de mouvement, utilise par le picker passager.
  interactif?: boolean
  onDeplacer?: (centre: { lat: number; lng: number }) => void
}) {
  const centreCarte: [number, number] = centre ?? [points[0]?.lat ?? 33.5731, points[0]?.lng ?? -7.5898]

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
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pin(p.couleur)} />
      ))}
      <CadrerPoints points={points} />
      {interactif && onDeplacer && <SignalerCentre onDeplacer={onDeplacer} />}
    </MapContainer>
  )
}
