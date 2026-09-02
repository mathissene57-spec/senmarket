'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

const Carte = dynamic(() => import('@/components/Carte'), { ssr: false })

// Points de repli tant que l'adresse tapee n'a pas encore ete geocodee
// (ou si le geocodage echoue) — centre de Casablanca par defaut.
const POINT_DEPART_DEFAUT = { lat: 33.5883, lng: -7.6114 }
const POINT_ARRIVEE_DEFAUT = { lat: 33.5885, lng: -7.5719 }

// Geocodage via Nominatim (OpenStreetMap), gratuit et sans cle API — usage
// limite a ~1 requete/seconde par sa politique d'usage publique, largement
// suffisant pour un pilote. A remplacer par un fournisseur payant si le
// volume grossit significativement.
async function geocoder(adresse: string): Promise<{ lat: number; lng: number } | null> {
  const requete = adresse.trim()
  if (requete.length < 3) return null
  try {
    const params = new URLSearchParams({ q: `${requete}, Casablanca, Maroc`, format: 'json', limit: '1' })
    const reponse = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
    const resultats = await reponse.json()
    if (!Array.isArray(resultats) || resultats.length === 0) return null
    return { lat: parseFloat(resultats[0].lat), lng: parseFloat(resultats[0].lon) }
  } catch {
    return null
  }
}

// Meme formule (haversine) que celle utilisee server-side dans creer_course —
// sert uniquement a l'affichage de l'estimation avant envoi.
function distanceHaversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.max(6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)), 0.3)
}

const OPERATEUR_ID = process.env.NEXT_PUBLIC_OPERATEUR_ID!

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string }
type Zone = { id: string; nom: string; tarif_base: number; tarif_km: number }
type Course = {
  id: string
  statut: string
  adresse_depart: string
  adresse_arrivee: string
  prix_estime: number
  prix_final: number | null
  chauffeur_id: string | null
}
type Chauffeur = { id: string; nom: string; vehicule: string | null; plaque: string | null; note_moyenne: number }

export default function PassagerPage() {
  const supabase = createClient()
  const [operateur, setOperateur] = useState<Operateur | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneId, setZoneId] = useState<string>('')
  const [ecran, setEcran] = useState<'connexion' | 'accueil' | 'recherche' | 'course' | 'fin' | 'historique' | 'sans_chauffeur'>('connexion')
  const [telephone, setTelephone] = useState('06 61 22 33 44')
  const [nom, setNom] = useState('')
  const [depart, setDepart] = useState('Position actuelle — Boulevard Zerktouni')
  const [arrivee, setArrivee] = useState('Gare Casa-Voyageurs')
  const [course, setCourse] = useState<Course | null>(null)
  const [chauffeur, setChauffeur] = useState<Chauffeur | null>(null)
  const [note, setNote] = useState(0)
  const [historique, setHistorique] = useState<Course[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [pointDepart, setPointDepart] = useState(POINT_DEPART_DEFAUT)
  const [pointArrivee, setPointArrivee] = useState(POINT_ARRIVEE_DEFAUT)
  const [repereEnCours, setRepereEnCours] = useState(false)
  const courseRef = useRef<Course | null>(null)

  useEffect(() => {
    supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire').eq('id', OPERATEUR_ID).single()
      .then(({ data }) => setOperateur(data))
    supabase.from('zones_operateur').select('id,nom,tarif_base,tarif_km').eq('operateur_id', OPERATEUR_ID).order('nom')
      .then(({ data }) => {
        setZones(data || [])
        if (data && data.length > 0) setZoneId(data[0].id)
      })
  }, [])

  useEffect(() => { courseRef.current = course }, [course])

  useEffect(() => {
    setRepereEnCours(true)
    const delai = setTimeout(() => {
      geocoder(depart).then((point) => { if (point) setPointDepart(point) }).finally(() => setRepereEnCours(false))
    }, 700)
    return () => clearTimeout(delai)
  }, [depart])

  useEffect(() => {
    setRepereEnCours(true)
    const delai = setTimeout(() => {
      geocoder(arrivee).then((point) => { if (point) setPointArrivee(point) }).finally(() => setRepereEnCours(false))
    }, 700)
    return () => clearTimeout(delai)
  }, [arrivee])

  useEffect(() => {
    if (!course) return
    const channel = supabase
      .channel('passager-course-' + course.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courses', filter: `id=eq.${course.id}` }, (payload) => {
        const updated = payload.new as Course
        setCourse(updated)
        if (updated.statut === 'assignee' && updated.chauffeur_id) {
          supabase.from('chauffeurs').select('id,nom,vehicule,plaque,note_moyenne').eq('id', updated.chauffeur_id).single()
            .then(({ data }) => setChauffeur(data))
          setEcran('course')
        } else if (updated.statut === 'en_cours') {
          setEcran('course')
        } else if (updated.statut === 'terminee') {
          setEcran('fin')
        } else if (updated.statut === 'sans_chauffeur' || updated.statut === 'annulee') {
          setEcran('sans_chauffeur')
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [course?.id])

  const zone = zones.find((z) => z.id === zoneId) || null
  // Estimation affichee avant envoi, a partir des points deja geocodes —
  // uniquement indicative : le prix qui compte vraiment est celui que le
  // serveur recalcule dans creer_course a partir des memes coordonnees,
  // jamais celui envoye par le navigateur (voir audit du 2026-09-02, §9).
  const distanceEstimeeKm = distanceHaversineKm(pointDepart, pointArrivee)
  const prixEstime = zone ? Math.round((Number(zone.tarif_base) + Number(zone.tarif_km) * distanceEstimeeKm) * 100) / 100 : 0

  async function commander() {
    if (!zoneId) return
    setErreur(null)
    setChargement(true)
    const { data, error } = await supabase.rpc('creer_course', {
      p_operateur_id: OPERATEUR_ID,
      p_telephone: telephone,
      p_nom: nom,
      p_adresse_depart: depart,
      p_adresse_arrivee: arrivee,
      p_zone_id: zoneId,
      p_depart_lat: pointDepart.lat,
      p_depart_lng: pointDepart.lng,
      p_arrivee_lat: pointArrivee.lat,
      p_arrivee_lng: pointArrivee.lng,
    })
    setChargement(false)
    if (error || !data || data.length === 0) { setErreur(error?.message || "Impossible de créer la course."); return }
    const cree = data[0]
    setCourse({ id: cree.id, statut: 'en_recherche', adresse_depart: depart, adresse_arrivee: arrivee, prix_estime: cree.prix_estime, prix_final: null, chauffeur_id: null })
    setEcran('recherche')
  }

  async function annulerCommande() {
    if (course) await supabase.rpc('annuler_course', { p_course_id: course.id, p_telephone: telephone })
    setCourse(null)
    setEcran('accueil')
  }

  async function envoyerNote() {
    if (!course) return
    if (note > 0) await supabase.rpc('noter_course', { p_course_id: course.id, p_telephone: telephone, p_note: note })
    await chargerHistorique()
    setEcran('historique')
  }

  async function chargerHistorique() {
    const { data } = await supabase.rpc('historique_passager', { p_telephone: telephone })
    setHistorique(data || [])
  }

  const primary = operateur?.couleur_primaire || '#101B3D'
  const accent = operateur?.couleur_secondaire || '#FF7A28'
  const vars = { ['--primary' as any]: primary, ['--accent' as any]: accent }

  return (
    <div className="page-shell" style={vars}>
      <div className="phone">
        {ecran === 'connexion' && (
          <div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ margin: '0 auto 24px' }}><span className="brand-mark">{operateur?.nom?.[0] || 'M'}</span></div>
            <h2 style={{ marginBottom: 4 }}>{operateur?.nom || 'Mobility OS'}</h2>
            <p className="muted">Réservez une course en quelques secondes</p>
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <label className="field-label">Numéro de téléphone</label>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
              <label className="field-label">Nom (optionnel)</label>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" />
            </div>
            <button className="btn" onClick={() => setEcran('accueil')} disabled={!telephone.trim()}>Continuer</button>
          </div>
        )}

        {ecran === 'accueil' && (
          <>
            <div className="screen-header">
              <span className="brand"><span className="brand-mark">{operateur?.nom?.[0] || 'M'}</span><span className="brand-label">{operateur?.nom}</span></span>
              <span className="badge ok">En ligne</span>
            </div>
            <div className="screen-body">
              <div className="map-placeholder">
                <Carte points={[{ ...pointDepart, couleur: primary }, { ...pointArrivee, couleur: accent }]} zoom={13} />
              </div>
              {repereEnCours && <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>Repérage de l&apos;adresse…</p>}
              <label className="field-label">Point de départ</label>
              <input type="text" value={depart} onChange={(e) => setDepart(e.target.value)} />
              <label className="field-label">Destination</label>
              <input type="text" value={arrivee} onChange={(e) => setArrivee(e.target.value)} />
              {zones.length > 0 && (
                <>
                  <label className="field-label">Zone tarifaire</label>
                  <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1px solid #DDD', fontSize: 15, marginBottom: 12, fontFamily: 'inherit' }}>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.nom}</option>
                    ))}
                  </select>
                </>
              )}
              {zone && (
                <div className="card card-row"><span>Prix estimé</span><span className="price">{prixEstime} DH</span></div>
              )}
              {erreur && <p className="error-text">{erreur}</p>}
            </div>
            <div className="screen-footer">
              <button className="btn accent" onClick={commander} disabled={chargement || !depart.trim() || !arrivee.trim()}>
                {chargement ? 'Envoi…' : 'Commander'}
              </button>
            </div>
          </>
        )}

        {ecran === 'recherche' && (
          <>
            <div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
              <div className="pulse" />
              <h3>Recherche d&apos;un chauffeur…</h3>
              <p className="muted">Un chauffeur disponible est notifié en direct</p>
            </div>
            <div className="screen-footer"><button className="btn outline" onClick={annulerCommande}>Annuler</button></div>
          </>
        )}

        {ecran === 'course' && course && (
          <>
            <div className="screen-header"><strong>{course.statut === 'assignee' ? 'Le chauffeur arrive' : 'Course en cours'}</strong></div>
            <div className="screen-body">
              <div className="map-placeholder">
                <Carte points={[{ ...pointDepart, couleur: primary }, { ...pointArrivee, couleur: accent }]} zoom={13} />
              </div>
              {chauffeur && (
                <div className="card card-row">
                  <div><strong>{chauffeur.nom}</strong><div className="muted">{chauffeur.vehicule} · {chauffeur.plaque}</div></div>
                  <span>⭐ {chauffeur.note_moyenne}</span>
                </div>
              )}
              <div className="card"><div className="muted">Trajet</div><strong>{course.adresse_depart} → {course.adresse_arrivee}</strong></div>
            </div>
          </>
        )}

        {ecran === 'fin' && course && (
          <>
            <div className="screen-header"><strong>Course terminée</strong></div>
            <div className="screen-body center">
              <p className="muted" style={{ marginTop: 16 }}>Montant à régler en espèces</p>
              <div className="price">{course.prix_final ?? course.prix_estime} DH</div>
              <div className="card" style={{ marginTop: 24, textAlign: 'left' }}>
                <div className="muted center" style={{ marginBottom: 8 }}>Notez votre chauffeur</div>
                <div className="stars center">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} className={`star${note >= i ? ' filled' : ''}`} onClick={() => setNote(i)}>★</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="screen-footer"><button className="btn" onClick={envoyerNote}>Terminer</button></div>
          </>
        )}

        {ecran === 'sans_chauffeur' && (
          <>
            <div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
              <h3>Aucun chauffeur disponible</h3>
              <p className="muted">Réessayez dans quelques minutes</p>
            </div>
            <div className="screen-footer"><button className="btn" onClick={() => { setCourse(null); setEcran('accueil') }}>Retour</button></div>
          </>
        )}

        {ecran === 'historique' && (
          <>
            <div className="screen-header"><strong>Historique</strong><button className="btn ghost" onClick={() => { setCourse(null); setNote(0); setEcran('accueil') }}>Accueil</button></div>
            <div className="screen-body">
              {historique.length === 0 && <p className="muted">Aucune course terminée pour l&apos;instant.</p>}
              {historique.map((c) => (
                <div key={c.id} className="card card-row">
                  <span>{c.adresse_depart} → {c.adresse_arrivee}</span>
                  <span>{c.prix_final ?? c.prix_estime} DH</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
