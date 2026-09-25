'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'

type LiveMapProps = {
  latitude: number
  longitude: number
  heightPx?: number
}

// Carte interactive qui suit la position en direct : le marqueur se
// déplace (panTo + setLatLng) au lieu de recharger toute la carte à
// chaque nouvelle position — contrairement à un simple iframe Google Maps.
export function LiveMap({ latitude, longitude, heightPx = 340 }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center: [latitude, longitude],
        zoom: 14,
        scrollWheelZoom: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker([latitude, longitude]).addTo(map)

      mapRef.current = map
      markerRef.current = marker
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }
    // Le container ne doit être initialisé qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([latitude, longitude])
      mapRef.current.panTo([latitude, longitude])
    }
  }, [latitude, longitude])

  return <div ref={containerRef} style={{ width: '100%', height: heightPx, borderRadius: 14 }} />
}
