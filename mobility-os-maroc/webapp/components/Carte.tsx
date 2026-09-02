'use client'

import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
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

export default function Carte({ points, centre, zoom = 14 }: { points: Point[]; centre?: [number, number]; zoom?: number }) {
  const centreCarte: [number, number] = centre ?? [points[0]?.lat ?? 33.5731, points[0]?.lng ?? -7.5898]

  return (
    <MapContainer
      center={centreCarte}
      zoom={zoom}
      scrollWheelZoom={false}
      dragging={false}
      zoomControl={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pin(p.couleur)} />
      ))}
      <CadrerPoints points={points} />
    </MapContainer>
  )
}
