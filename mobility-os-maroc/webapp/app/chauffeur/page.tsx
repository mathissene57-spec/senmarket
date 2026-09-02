'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { distanceHaversineKm } from '@/lib/geo'

const OPERATEUR_ID = process.env.NEXT_PUBLIC_OPERATEUR_ID!

// Rayon de dispatch (P1.5, premiere version) : un chauffeur ne voit une
// nouvelle demande que si elle est a moins de RAYON_DISPATCH_KM de sa
// derniere position connue. Filtrage cote client (pas une garantie RLS) —
// l'acceptation reste protegee par le verrou atomique de accepter_course
// quel que soit le nombre de chauffeurs qui voient la demande. Si la
// position du chauffeur n'est pas encore connue (geolocalisation refusee
// ou indisponible), on retombe sur le comportement precedent (tout montrer)
// plutot que de bloquer silencieusement les demandes.
const RAYON_DISPATCH_KM = 6

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string }
type ChauffeurRow = { id: string; nom: string; telephone: string; statut: string }
type CourseNotif = { id: string; adresse_depart: string; adresse_arrivee: string; prix_estime: number; statut: string; distance_km?: number }
type CourseTerminee = { id: string; adresse_depart: string; adresse_arrivee: string; prix_final: number | null; created_at: string }

export default function ChauffeurPage() {
  const supabase = createClient()
  const [operateur, setOperateur] = useState<Operateur | null>(null)
  const [ecran, setEcran] = useState<'connexion' | 'accueil' | 'demande' | 'navigation' | 'encours' | 'fin' | 'historique'>('connexion')
  const [telephone, setTelephone] = useState('')
  const [chauffeur, setChauffeur] = useState<ChauffeurRow | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [demande, setDemande] = useState<CourseNotif | null>(null)
  const [courseActive, setCourseActive] = useState<CourseNotif | null>(null)
  const [prixTermine, setPrixTermine] = useState<number | null>(null)
  const [historique, setHistorique] = useState<CourseTerminee[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [positionConnue, setPositionConnue] = useState(false)
  const positionRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire').eq('id', OPERATEUR_ID).single()
      .then(({ data }) => setOperateur(data))
  }, [])

  // P1.4 : suit la position du chauffeur pendant qu'il est connecte, et la
  // transmet au serveur au maximum toutes les 15s (pas a chaque evenement
  // GPS). Si la geolocalisation est refusee ou indisponible, on continue
  // sans position — le filtrage par proximite ci-dessous retombe alors sur
  // "tout montrer" plutot que de bloquer silencieusement les demandes.
  useEffect(() => {
    if (!chauffeur || typeof navigator === 'undefined' || !navigator.geolocation) return
    let dernierEnvoi = 0
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        positionRef.current = point
        setPositionConnue(true)
        const maintenant = Date.now()
        if (maintenant - dernierEnvoi > 15000) {
          dernierEnvoi = maintenant
          supabase.rpc('mettre_a_jour_position', {
            p_chauffeur_id: chauffeur.id, p_telephone: chauffeur.telephone, p_lat: point.lat, p_lng: point.lng,
          })
        }
      },
      () => { /* refuse ou indisponible : on continue sans position */ },
      { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [chauffeur?.id])

  useEffect(() => {
    if (!chauffeur) return
    const channel = supabase
      .channel('chauffeur-' + chauffeur.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'courses', filter: `operateur_id=eq.${OPERATEUR_ID}` }, (payload) => {
        const c = payload.new as any
        if (c.statut === 'en_recherche') {
          setChauffeur((prev) => {
            if (prev && prev.statut === 'disponible') {
              const position = positionRef.current
              const depart = c.depart_lat != null && c.depart_lng != null ? { lat: c.depart_lat, lng: c.depart_lng } : null
              const distance = position && depart ? distanceHaversineKm(position, depart) : null
              // Position connue et course hors rayon : on l'ignore silencieusement,
              // un autre chauffeur plus proche la verra. Sans position connue,
              // on affiche quand meme (comportement precedent, pas de regression
              // pour un chauffeur qui n'a pas active la geolocalisation).
              if (distance !== null && distance > RAYON_DISPATCH_KM) return prev
              setDemande({ id: c.id, adresse_depart: c.adresse_depart, adresse_arrivee: c.adresse_arrivee, prix_estime: c.prix_estime, statut: c.statut, distance_km: distance ?? undefined })
              setEcran('demande')
            }
            return prev
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chauffeur?.id])

  async function seConnecter() {
    setErreur(null)
    setChargement(true)
    const { data, error } = await supabase.rpc('connexion_chauffeur', {
      p_operateur_id: OPERATEUR_ID,
      p_telephone: telephone.replace(/\s/g, ''),
    })
    setChargement(false)
    const trouve = data && data.length > 0 ? data[0] : null
    if (error || !trouve) { setErreur("Chauffeur non reconnu. Contactez votre opérateur pour être ajouté à la flotte."); return }
    setChauffeur(trouve)
    setEcran('accueil')
    chargerHistorique(trouve.id, trouve.telephone)
  }

  async function toggleDispo() {
    if (!chauffeur) return
    const nouveauStatut = chauffeur.statut === 'disponible' ? 'indisponible' : 'disponible'
    const { data, error } = await supabase.rpc('definir_disponibilite_chauffeur', {
      p_chauffeur_id: chauffeur.id,
      p_telephone: chauffeur.telephone,
      p_statut: nouveauStatut,
    })
    if (!error && data) setChauffeur({ ...chauffeur, statut: nouveauStatut })
  }

  async function accepter() {
    if (!demande || !chauffeur) return
    const { data, error } = await supabase.rpc('accepter_course', { p_course_id: demande.id, p_chauffeur_id: chauffeur.id, p_telephone: chauffeur.telephone })
    if (error) { setMessage(error.message); return }
    if (!data) {
      setMessage('Cette course a déjà été prise par un autre chauffeur.')
      setDemande(null)
      setEcran('accueil')
      return
    }
    setChauffeur({ ...chauffeur, statut: 'en_course' })
    setCourseActive(demande)
    setDemande(null)
    setEcran('navigation')
  }

  function refuser() {
    setDemande(null)
    setEcran('accueil')
  }

  async function jeSuisArrive() {
    if (!courseActive || !chauffeur) return
    await supabase.rpc('avancer_course', { p_course_id: courseActive.id, p_nouveau_statut: 'en_cours', p_telephone: chauffeur.telephone })
    setEcran('encours')
  }

  async function terminerCourse() {
    if (!courseActive || !chauffeur) return
    await supabase.rpc('avancer_course', { p_course_id: courseActive.id, p_nouveau_statut: 'terminee', p_telephone: chauffeur.telephone })
    setPrixTermine(courseActive.prix_estime)
    setChauffeur({ ...chauffeur, statut: 'disponible' })
    setEcran('fin')
  }

  async function chargerHistorique(chauffeurId: string, telephoneChauffeur: string) {
    const { data } = await supabase.rpc('historique_chauffeur', { p_chauffeur_id: chauffeurId, p_telephone: telephoneChauffeur })
    setHistorique(data || [])
  }

  const gainsJour = historique
    .filter((c) => new Date(c.created_at).toDateString() === new Date().toDateString())
    .reduce((acc, c) => acc + Number(c.prix_final || 0), 0)

  const primary = operateur?.couleur_primaire || '#101B3D'
  const accent = operateur?.couleur_secondaire || '#FF7A28'
  const vars = { ['--primary' as any]: primary, ['--accent' as any]: accent }

  return (
    <div className="page-shell" style={vars}>
      <div className="phone">
        {ecran === 'connexion' && (
          <div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ margin: '0 auto 24px' }}><span className="brand-mark">{operateur?.nom?.[0] || 'M'}</span></div>
            <h2 style={{ marginBottom: 4 }}>{operateur?.nom} Chauffeur</h2>
            <p className="muted">Espace réservé aux chauffeurs de la flotte</p>
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <label className="field-label">Numéro de téléphone</label>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="0655112233" />
            </div>
            {erreur && <p className="error-text">{erreur}</p>}
            <button className="btn" onClick={seConnecter} disabled={chargement || !telephone.trim()}>
              {chargement ? 'Connexion…' : 'Se connecter'}
            </button>
          </div>
        )}

        {ecran === 'accueil' && chauffeur && (
          <>
            <div className="screen-header">
              <span className="brand"><span className="brand-mark">{operateur?.nom?.[0] || 'M'}</span><span className="brand-label">{operateur?.nom}</span></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="muted">{chauffeur.statut === 'disponible' ? 'Disponible' : chauffeur.statut === 'en_course' ? 'En course' : 'Indisponible'}{positionConnue ? ' · 📍' : ''}</span>
                <button className={`toggle${chauffeur.statut === 'disponible' ? ' on' : ''}`} onClick={toggleDispo} disabled={chauffeur.statut === 'en_course'} />
              </div>
            </div>
            <div className="screen-body">
              <div className="map-placeholder" />
              <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="card"><div className="muted">Gains aujourd&apos;hui</div><div className="price" style={{ fontSize: 20 }}>{gainsJour} DH</div></div>
                <div className="card"><div className="muted">Courses</div><div className="price" style={{ fontSize: 20 }}>{historique.length}</div></div>
              </div>
              {message && <p className="muted">{message}</p>}
              <button className="btn outline" onClick={() => setEcran('historique')}>Voir l&apos;historique</button>
            </div>
          </>
        )}

        {ecran === 'demande' && demande && (
          <>
            <div className="screen-header"><strong>Nouvelle course</strong></div>
            <div className="screen-body">
              <div className="card">
                <div className="card-row"><span className="muted">Départ</span><span>{demande.adresse_depart}</span></div>
                <div className="card-row"><span className="muted">Arrivée</span><span>{demande.adresse_arrivee}</span></div>
              </div>
              <div className="card card-row"><span>Vous gagnez</span><span className="price">{demande.prix_estime} DH</span></div>
              {demande.distance_km != null && <p className="muted">Départ à {demande.distance_km.toFixed(1)} km de vous</p>}
            </div>
            <div className="screen-footer">
              <div className="btn-row">
                <button className="btn outline" onClick={refuser}>Refuser</button>
                <button className="btn accent" onClick={accepter}>Accepter</button>
              </div>
            </div>
          </>
        )}

        {ecran === 'navigation' && courseActive && (
          <>
            <div className="screen-header"><strong>En route vers le passager</strong></div>
            <div className="screen-body">
              <div className="map-placeholder" />
              <div className="card"><div className="muted">Départ</div><strong>{courseActive.adresse_depart}</strong></div>
              <a className="btn outline" href="https://www.google.com/maps" target="_blank" rel="noopener" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 10 }}>
                Ouvrir la navigation (Waze / Google Maps)
              </a>
            </div>
            <div className="screen-footer"><button className="btn" onClick={jeSuisArrive}>Je suis arrivé</button></div>
          </>
        )}

        {ecran === 'encours' && courseActive && (
          <>
            <div className="screen-header"><strong>Passager à bord</strong></div>
            <div className="screen-body">
              <div className="map-placeholder" />
              <div className="card"><div className="muted">Destination</div><strong>{courseActive.adresse_arrivee}</strong></div>
            </div>
            <div className="screen-footer"><button className="btn accent" onClick={terminerCourse}>Terminer la course</button></div>
          </>
        )}

        {ecran === 'fin' && (
          <>
            <div className="screen-header"><strong>Course terminée</strong></div>
            <div className="screen-body center">
              <p className="muted" style={{ marginTop: 16 }}>Montant encaissé (espèces)</p>
              <div className="price">{prixTermine} DH</div>
              <p className="muted" style={{ marginTop: 16 }}>Ajouté à vos gains du jour</p>
            </div>
            <div className="screen-footer"><button className="btn" onClick={() => { setCourseActive(null); chauffeur && chargerHistorique(chauffeur.id, chauffeur.telephone); setEcran('accueil') }}>Retour à l&apos;accueil</button></div>
          </>
        )}

        {ecran === 'historique' && chauffeur && (
          <>
            <div className="screen-header"><strong>Historique</strong><button className="btn ghost" onClick={() => setEcran('accueil')}>Accueil</button></div>
            <div className="screen-body">
              {historique.length === 0 && <p className="muted">Aucune course terminée pour l&apos;instant.</p>}
              {historique.map((c) => (
                <div key={c.id} className="card card-row"><span>{c.adresse_depart} → {c.adresse_arrivee}</span><span>{c.prix_final} DH</span></div>
              ))}
              <div className="card card-row"><span className="muted">Total du jour</span><strong>{gainsJour} DH</strong></div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
