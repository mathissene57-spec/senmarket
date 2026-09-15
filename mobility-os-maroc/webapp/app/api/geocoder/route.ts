// P2 (M-2, plan de finalisation V1) : proxy serveur pour le geocodage
// Nominatim (OpenStreetMap), auparavant appele directement depuis le
// navigateur du passager (app/passager/page.tsx).
//
// Deux problemes avec l'appel direct client -> Nominatim :
// 1. La politique d'usage de Nominatim (https://operations.osmfoundation.org/
//    policies/nominatim/) exige d'identifier l'application appelante via un
//    User-Agent ou Referer valides -- un fetch() depuis un navigateur envoie
//    un User-Agent generique (celui du navigateur de l'utilisateur, pas de
//    l'app), ce qui expose l'app a un blocage silencieux si Nominatim
//    resserre sa politique, sans aucun moyen cote client de le corriger.
// 2. Chaque adresse tapee par un passager (donc potentiellement son domicile
//    ou sa destination) partait directement vers un tiers (OSM) sans passer
//    par l'infrastructure de l'app -- aucun controle, aucun cache, aucune
//    limite cote serveur.
//
// Ce proxy fixe les deux : User-Agent explicite identifiant Mobility OS
// Maroc (exige par la politique Nominatim), et un cache memoire de courte
// duree (5 min) qui evite de re-interroger Nominatim pour une meme adresse
// deja recherchee recemment (adresses de depart/arrivee frequemment
// repetees -- gares, aeroport, quartiers connus). Purement additif : le
// contrat cote client (adresse texte -> {lat,lng} ou null) ne change pas.
//
// Geocodage inverse (lat,lng -> adresse) ajoute pour le picker "choisir sur
// la carte" cote passager (deplacer un repere et recuperer une adresse
// lisible a afficher/envoyer) -- meme proxy, meme politique d'usage
// Nominatim a respecter, cache separe par coordonnees arrondies.

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; resultat: { lat: number; lng: number } | null }>()
const cacheInverse = new Map<string, { at: number; adresse: string | null }>()

async function geocoderInverse(lat: number, lng: number) {
  const cle = `${lat.toFixed(5)},${lng.toFixed(5)}`
  const enCache = cacheInverse.get(cle)
  if (enCache && Date.now() - enCache.at < CACHE_TTL_MS) {
    return Response.json({ adresse: enCache.adresse })
  }

  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json' })

  try {
    const reponse = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { 'User-Agent': 'MobilityOSMaroc/1.0 (pilote transport Casablanca)' },
    })
    const resultat = await reponse.json()
    // display_name est tres long (ex: "12, Boulevard Zerktouni, Maarif,
    // Casablanca, Casablanca-Settat, 20100, Maroc") -- on ne garde que les
    // premiers segments, assez precis pour identifier le lieu sans deborder
    // du champ adresse.
    const adresse = typeof resultat?.display_name === 'string'
      ? resultat.display_name.split(',').slice(0, 3).join(',').trim()
      : null

    cacheInverse.set(cle, { at: Date.now(), adresse })
    return Response.json({ adresse })
  } catch {
    return Response.json({ adresse: null })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  if (lat != null && lng != null) {
    const latN = parseFloat(lat)
    const lngN = parseFloat(lng)
    if (Number.isNaN(latN) || Number.isNaN(lngN)) return Response.json({ adresse: null })
    return geocoderInverse(latN, lngN)
  }

  const adresse = (searchParams.get('q') || '').trim()

  if (adresse.length < 3) {
    return Response.json({ lat: null, lng: null })
  }

  // Foundation V1 : la ville/le pays de biais viennent desormais de
  // l'operateur appelant (operateurs.ville, countries.name), passes en
  // parametres par le client -- auparavant "Casablanca, Maroc" etait force
  // pour absolument toute adresse, ce qui cassait deja le geocodage pour
  // tout operateur marocain hors agglomeration de Casablanca. Repli
  // strictement identique au comportement precedent si un appelant ne les
  // fournit pas encore.
  const ville = (searchParams.get('ville') || '').trim() || 'Casablanca'
  const pays = (searchParams.get('pays') || '').trim() || 'Maroc'

  const cle = `${ville.toLowerCase()}|${pays.toLowerCase()}|${adresse.toLowerCase()}`
  const enCache = cache.get(cle)
  if (enCache && Date.now() - enCache.at < CACHE_TTL_MS) {
    return Response.json(enCache.resultat ?? { lat: null, lng: null })
  }

  // Correctif "recherche toujours en echec" (constate en prod : le passager
  // ne pouvait jamais commander via une adresse tapee, seulement via la
  // carte). Cause reelle, invisible jusqu'ici car le catch ci-dessous
  // avalait silencieusement toute erreur sans jamais logger ni le statut
  // HTTP de Nominatim ni la requete qui echouait : une seule requete
  // stricte "adresse, ville, pays" -- Nominatim renvoie souvent 0 resultat
  // des que le libelle de ville de l'operateur ne correspond pas exactement
  // a son indexation (ex. "Casablanca-Settat" au lieu de "Casablanca"), ou
  // que l'adresse tapee contient deja sa propre ville/quartier. On essaie
  // maintenant une requete plus large si la premiere echoue, et chaque
  // etape est loggee (visible dans les logs runtime Vercel) pour pouvoir
  // diagnostiquer un futur echec au lieu de deviner.
  const requetes = [
    `${adresse}, ${ville}, ${pays}`,
    `${adresse}, ${pays}`,
  ]

  async function interrogerNominatim(q: string): Promise<Array<{ lat: string; lon: string }> | null> {
    const params = new URLSearchParams({ q, format: 'json', limit: '1' })
    const reponse = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        // Requis par la politique d'usage Nominatim : identifie clairement
        // l'application appelante (jamais un User-Agent de navigateur).
        'User-Agent': 'MobilityOSMaroc/1.0 (pilote transport Casablanca)',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!reponse.ok) {
      console.error(`[geocoder] Nominatim a repondu ${reponse.status} ${reponse.statusText} pour "${q}"`)
      return null
    }
    const resultats = await reponse.json()
    return Array.isArray(resultats) ? resultats : null
  }

  let point: { lat: number; lng: number } | null = null
  for (const q of requetes) {
    try {
      const resultats = await interrogerNominatim(q)
      if (resultats && resultats.length > 0) {
        point = { lat: parseFloat(resultats[0].lat), lng: parseFloat(resultats[0].lon) }
        break
      }
      console.log(`[geocoder] aucun resultat Nominatim pour "${q}"`)
    } catch (e) {
      console.error(`[geocoder] echec reseau pour "${q}" :`, e instanceof Error ? e.message : e)
    }
  }

  cache.set(cle, { at: Date.now(), resultat: point })
  return Response.json(point ?? { lat: null, lng: null })
}
