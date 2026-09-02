// Distance a vol d'oiseau (haversine), en kilometres. Meme formule que celle
// utilisee server-side dans creer_course (RPC Supabase) — sert a l'affichage
// et au filtrage cote client ; le serveur reste la seule source de verite
// pour le prix.
export function distanceHaversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.max(6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)), 0.3)
}
