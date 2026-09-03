'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { distanceHaversineKm } from '@/lib/geo'
import { useOperateurId } from '@/lib/useOperateurId'

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string }
type ChauffeurRow = { id: string; nom: string; telephone: string; statut: string }
type CourseNotif = { id: string; adresse_depart: string; adresse_arrivee: string; prix_estime: number; statut: string; distance_km?: number }
type CourseTerminee = { id: string; adresse_depart: string; adresse_arrivee: string; prix_final: number | null; created_at: string }

export default function ChauffeurPage() {
  const supabase = createClient()
  const { operateurId: OPERATEUR_ID, chargement: chargementOperateur, erreur: erreurResolution } = useOperateurId()
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
  const [otpEnvoye, setOtpEnvoye] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpCodeDebug, setOtpCodeDebug] = useState<string | null>(null)
  const [otpEnCours, setOtpEnCours] = useState(false)
  const [otpErreur, setOtpErreur] = useState<string | null>(null)
  const positionRef = useRef<{ lat: number; lng: number } | null>(null)
  const ecranRef = useRef(ecran)
  // P1.6 : courses deja refusees ou en cours d'evaluation par CE chauffeur —
  // ne doivent jamais reapparaitre, meme quand le rayon de recherche
  // s'elargit avec le temps et que la mise a jour de la course est rediffusee.
  const ignoreesRef = useRef<Set<string>>(new Set())

  useEffect(() => { ecranRef.current = ecran }, [ecran])

  useEffect(() => {
    if (!OPERATEUR_ID) return
    supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire').eq('id', OPERATEUR_ID).single()
      .then(({ data }) => setOperateur(data))
  }, [OPERATEUR_ID])

  // P0.2 (confort) : le telephone verifie reste valide 24h cote serveur,
  // mais l'ecran revenait a "connexion" a chaque rechargement faute d'etat
  // persiste. On retente une connexion silencieuse avec le dernier telephone
  // connu : si le serveur le considere toujours verifie et reconnu, on saute
  // directement a l'accueil ; sinon on reste sur l'ecran connexion (deja
  // pre-rempli), sans afficher d'erreur pour cette tentative automatique.
  useEffect(() => {
    if (!OPERATEUR_ID) return
    const sauvegarde = typeof window !== 'undefined' ? localStorage.getItem('mos_chauffeur_telephone') : null
    if (!sauvegarde) return
    setTelephone(sauvegarde)
    supabase.rpc('connexion_chauffeur', { p_operateur_id: OPERATEUR_ID, p_telephone: sauvegarde }).then(({ data, error }) => {
      const trouve = data && data.length > 0 ? data[0] : null
      if (!error && trouve) {
        setChauffeur(trouve)
        setEcran('accueil')
        chargerHistorique(trouve.id, trouve.telephone)
      }
    })
  }, [OPERATEUR_ID])

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

  // P1.6 : ecoute aussi bien la creation que les mises a jour d'une course —
  // le rayon de recherche s'elargit avec le temps (voir expirer_courses_en_
  // recherche cote serveur), donc une demande d'abord hors de portee peut
  // redevenir pertinente sans qu'une nouvelle ligne ne soit inseree.
  useEffect(() => {
    if (!chauffeur) return
    const channel = supabase
      .channel('chauffeur-' + chauffeur.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `operateur_id=eq.${OPERATEUR_ID}` }, (payload) => {
        const c = payload.new as any
        if (c.statut !== 'en_recherche' || ignoreesRef.current.has(c.id) || ecranRef.current === 'demande') return
        setChauffeur((prev) => {
          if (prev && prev.statut === 'disponible') {
            const position = positionRef.current
            const depart = c.depart_lat != null && c.depart_lng != null ? { lat: c.depart_lat, lng: c.depart_lng } : null
            const rayon = Number(c.rayon_recherche_km) || 3
            const distance = position && depart ? distanceHaversineKm(position, depart) : null
            // Position connue et course hors du rayon actuel : on l'ignore pour
            // l'instant, un autre chauffeur plus proche la verra — mais on ne la
            // marque pas comme definitivement refusee, elle pourra redevenir
            // visible si le rayon s'elargit encore. Sans position connue, on
            // affiche quand meme (pas de regression pour un chauffeur sans GPS).
            if (distance !== null && distance > rayon) return prev
            setDemande({ id: c.id, adresse_depart: c.adresse_depart, adresse_arrivee: c.adresse_arrivee, prix_estime: c.prix_estime, statut: c.statut, distance_km: distance ?? undefined })
            setEcran('demande')
            // P1 (course_events) : journalise la proposition — n'affecte jamais
            // le dispatch lui-meme, purement pour l'audit trail.
            supabase.rpc('proposer_course', { p_course_id: c.id, p_chauffeur_id: prev.id, p_telephone: prev.telephone })
          }
          return prev
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chauffeur?.id])

  async function seConnecter() {
    if (!OPERATEUR_ID) return
    setErreur(null)
    setChargement(true)
    const { data, error } = await supabase.rpc('connexion_chauffeur', {
      p_operateur_id: OPERATEUR_ID,
      p_telephone: telephone.replace(/\s/g, ''),
    })
    setChargement(false)
    const trouve = data && data.length > 0 ? data[0] : null
    if (error || !trouve) { setErreur("Chauffeur non reconnu. Contactez votre opérateur pour être ajouté à la flotte."); return }
    if (typeof window !== 'undefined') localStorage.setItem('mos_chauffeur_telephone', telephone.replace(/\s/g, ''))
    setChauffeur(trouve)
    setEcran('accueil')
    chargerHistorique(trouve.id, trouve.telephone)
  }

  // P0.2 : verification OTP reelle avant connexion_chauffeur. SMS stubbe —
  // aucun fournisseur configure — demander_otp() renvoie le code en clair,
  // affiche ici dans un bandeau "mode demo" au lieu d'un SMS reel.
  async function demanderOtp() {
    setOtpErreur(null)
    setOtpEnCours(true)
    const { data, error } = await supabase.rpc('demander_otp', { p_telephone: telephone.replace(/\s/g, '') })
    setOtpEnCours(false)
    if (error) { setOtpErreur(error.message); return }
    setOtpCodeDebug(data as string)
    setOtpEnvoye(true)
  }

  async function verifierOtpEtConnecter() {
    setOtpErreur(null)
    setOtpEnCours(true)
    const { data, error } = await supabase.rpc('verifier_otp', { p_telephone: telephone.replace(/\s/g, ''), p_code: otpCode })
    setOtpEnCours(false)
    if (error) { setOtpErreur(error.message); return }
    if (!data) { setOtpErreur('Code incorrect.'); return }
    seConnecter()
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
      ignoreesRef.current.add(demande.id)
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
    if (demande) {
      ignoreesRef.current.add(demande.id)
      // P1 (course_events) : journalise le refus — n'affecte jamais le
      // dispatch lui-meme, purement pour l'audit trail.
      if (chauffeur) supabase.rpc('refuser_course', { p_course_id: demande.id, p_chauffeur_id: chauffeur.id, p_telephone: chauffeur.telephone })
    }
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

  // Changer de chauffeur (finition UX) : aucun moyen de se deconnecter
  // n'existait dans cette app -- le telephone verifie reste enregistre dans
  // localStorage et l'effet de reconnexion silencieuse au demarrage reconnecte
  // automatiquement le meme chauffeur indefiniment. Sur une tablette partagee
  // par plusieurs chauffeurs (usage reel constate), impossible de rendre la
  // main a un collegue sans vider le stockage du navigateur a la main.
  // Bloque si une course est en cours pour ne pas perdre l'ecran de suivi.
  function seDeconnecter() {
    if (typeof window !== 'undefined') localStorage.removeItem('mos_chauffeur_telephone')
    setChauffeur(null)
    setTelephone('')
    setHistorique([])
    setOtpEnvoye(false)
    setOtpCode('')
    setOtpCodeDebug(null)
    setOtpErreur(null)
    setEcran('connexion')
  }

  const gainsJour = historique
    .filter((c) => new Date(c.created_at).toDateString() === new Date().toDateString())
    .reduce((acc, c) => acc + Number(c.prix_final || 0), 0)

  const primary = operateur?.couleur_primaire || '#101B3D'
  const accent = operateur?.couleur_secondaire || '#FF7A28'
  const vars = { ['--primary' as any]: primary, ['--accent' as any]: accent }

  if (chargementOperateur) return null
  if (erreurResolution || !OPERATEUR_ID) {
    return (
      <div className="page-shell">
        <div className="phone"><div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
          <h3>Opérateur introuvable</h3>
          <p className="muted">{erreurResolution || "Ce lien ne correspond à aucun opérateur actif."}</p>
        </div></div>
      </div>
    )
  }

  return (
    <div className="page-shell" style={vars}>
      <div className="phone">
      <div key={ecran} className="screen-fade">
        {ecran === 'connexion' && (
          <div className="screen-body center" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ margin: '0 auto 24px' }}><span className="brand-mark">{operateur?.nom?.[0] || 'M'}</span></div>
            <h2 style={{ marginBottom: 4 }}>{operateur?.nom} Chauffeur</h2>
            <p className="muted">Espace réservé aux chauffeurs de la flotte</p>
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <label className="field-label">Numéro de téléphone</label>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="0655112233" disabled={otpEnvoye} />
              {otpEnvoye && (
                <>
                  {otpCodeDebug && (
                    <p className="muted" style={{ background: '#FFF1DE', padding: 10, borderRadius: 8 }}>
                      Mode démo (SMS non branché) — votre code : <strong>{otpCodeDebug}</strong>
                    </p>
                  )}
                  <label className="field-label">Code reçu par SMS</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="123456" />
                </>
              )}
            </div>
            {(erreur || otpErreur) && <p className="error-text">{erreur || otpErreur}</p>}
            {!otpEnvoye ? (
              <button className="btn" onClick={demanderOtp} disabled={!telephone.trim() || otpEnCours}>
                {otpEnCours ? 'Envoi…' : 'Recevoir un code'}
              </button>
            ) : (
              <>
                <button className="btn" onClick={verifierOtpEtConnecter} disabled={otpCode.length !== 6 || chargement || otpEnCours}>
                  {chargement || otpEnCours ? 'Connexion…' : 'Confirmer et se connecter'}
                </button>
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setOtpEnvoye(false); setOtpCode(''); setOtpCodeDebug(null); setOtpErreur(null) }}>
                  Changer de numéro
                </button>
              </>
            )}
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
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={chauffeur.statut === 'en_course'}
                title={chauffeur.statut === 'en_course' ? 'Terminez la course en cours avant de changer de chauffeur' : undefined}
                onClick={seDeconnecter}
              >
                Changer de chauffeur
              </button>
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
    </div>
  )
}
