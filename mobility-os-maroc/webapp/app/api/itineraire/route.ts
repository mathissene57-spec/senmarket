// Proxy serveur pour le calcul d'itineraire routier reel (OSRM, serveur de
// demonstration public project-osrm.org) -- meme raisonnement que le proxy
// Nominatim (app/api/geocoder/route.ts) : jamais d'appel direct navigateur ->
// service tiers (identification correcte du serveur, cache court cote
// serveur pour eviter de re-interroger un meme trajet depart/arrivee repete
// pendant toute la duree d'une course).
//
// Demande explicite : la ligne reliant depart et arrivee sur la carte doit
// suivre le trajet routier le plus court, pas relier les deux points a vol
// d'oiseau. OSRM renvoie la geometrie complete du trajet (liste de points
// lat/lng le long des routes reellement empruntables) -- c'est cette liste
// qui est dessinee, pas seulement les deux extremites.
//
// Repli explicite si le service est indisponible (timeout, erreur, aucun
// trajet trouve) : renvoyer null plutot qu'une erreur -- l'appelant (Carte.tsx)
// retombe alors sur la ligne droite depart-arrivee, jamais une carte cassee.

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; points: { lat: number; lng: number }[] | null }>()

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const departLat = parseFloat(searchParams.get('depart_lat') || '')
  const departLng = parseFloat(searchParams.get('depart_lng') || '')
  const arriveeLat = parseFloat(searchParams.get('arrivee_lat') || '')
  const arriveeLng = parseFloat(searchParams.get('arrivee_lng') || '')

  if ([departLat, departLng, arriveeLat, arriveeLng].some((n) => Number.isNaN(n))) {
    return Response.json({ points: null })
  }

  const cle = `${departLat.toFixed(5)},${departLng.toFixed(5)}|${arriveeLat.toFixed(5)},${arriveeLng.toFixed(5)}`
  const enCache = cache.get(cle)
  if (enCache && Date.now() - enCache.at < CACHE_TTL_MS) {
    return Response.json({ points: enCache.points })
  }

  // OSRM attend lng,lat (ordre GeoJSON), pas lat,lng.
  const url = `https://router.project-osrm.org/route/v1/driving/${departLng},${departLat};${arriveeLng},${arriveeLat}?overview=full&geometries=geojson`

  let points: { lat: number; lng: number }[] | null = null
  try {
    const reponse = await fetch(url, {
      headers: { 'User-Agent': 'MobilityOSMaroc/1.0 (pilote transport Casablanca)' },
      signal: AbortSignal.timeout(5000),
    })
    if (reponse.ok) {
      const data = await reponse.json()
      const coords = data?.routes?.[0]?.geometry?.coordinates
      if (Array.isArray(coords) && coords.length > 1) {
        points = coords.map(([lng, lat]: [number, number]) => ({ lat, lng }))
      } else {
        console.log(`[itineraire] aucun trajet OSRM pour ${cle}`)
      }
    } else {
      console.error(`[itineraire] OSRM a repondu ${reponse.status} ${reponse.statusText} pour ${cle}`)
    }
  } catch (e) {
    console.error(`[itineraire] echec reseau pour ${cle} :`, e instanceof Error ? e.message : e)
  }

  cache.set(cle, { at: Date.now(), points })
  return Response.json({ points })
}
