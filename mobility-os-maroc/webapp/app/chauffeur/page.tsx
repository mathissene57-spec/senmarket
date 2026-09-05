'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { distanceHaversineKm } from '@/lib/geo'
import { useOperateurId } from '@/lib/useOperateurId'
import { registerServiceWorker, notifier, subscribeToPush } from '@/lib/notifications'

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string }
type ChauffeurRow = { id: string; nom: string; telephone: string; statut: string }
type CourseNotif = { id: string; adresse_depart: string; adresse_arrivee: string; prix_estime: number; statut: string; distance_km?: number }
type CourseTerminee = { id: string; adresse_depart: string; adresse_arrivee: string; prix_final: number | null; created_at: string }
type Contact = { nom: string; telephone: string }
type Message = { id: string; expediteur: 'passager' | 'chauffeur'; contenu: string; created_at: string }

// Voir app/passager/page.tsx pour l'explication -- meme risque de texte
// blanc invisible sur un bouton dont la couleur est choisie par l'operateur.
function couleurTexteContrastee(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#FFFFFF'
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance > 150 ? '#101B3D' : '#FFFFFF'
}

export default function ChauffeurPage() {
  const supabase = createClient()
  const { operateurId: OPERATEUR_ID, chargement: chargementOperateur, erreur: erreurResolution } = useOperateurId()
  const [operateur, setOperateur] = useState<Operateur | null>(null)
  const [ecran, setEcran] = useState<'connexion' | 'accueil' | 'demande' | 'navigation' | 'encours' | 'fin' | 'historique' | 'messages'>('connexion')
  const [telephone, setTelephone] = useState('')
  const [chauffeur, setChauffeur] = useState<ChauffeurRow | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [demande, setDemande] = useState<CourseNotif | null>(null)
  const [courseActive, setCourseActive] = useState<CourseNotif | null>(null)
  const [contactPassager, setContactPassager] = useState<Contact | null>(null)
  const [prixTermine, setPrixTermine] = useState<number | null>(null)
  const [historique, setHistorique] = useState<CourseTerminee[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [positionConnue, setPositionConnue] = useState(false)
  const [otpEnvoye, setOtpEnvoye] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpEnCours, setOtpEnCours] = useState(false)
  const [otpErreur, setOtpErreur] = useState<string | null>(null)
  const [ecranAvantMessages, setEcranAvantMessages] = useState<'navigation' | 'encours'>('navigation')
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesVues, setMessagesVues] = useState(0)
  const [messageTexte, setMessageTexte] = useState('')
  const [envoiMessageEnCours, setEnvoiMessageEnCours] = useState(false)
  const [permissionNotif, setPermissionNotif] = useState<NotificationPermission | 'indisponible'>('indisponible')
  // P7 (confort) : un onglet mis en arriere-plan peut etre completement
  // decharge par le navigateur mobile (iOS Safari, Android sous pression
  // memoire) -- au retour, React remonte de zero et l'ecran "connexion"
  // s'affichait un instant avant que la reconnexion silencieuse (ci-dessous)
  // ne bascule sur "accueil", donnant l'impression d'une deconnexion alors
  // que la session (verifiee 24h) etait toujours valide. Ce drapeau retarde
  // l'affichage de l'ecran connexion tant qu'on n'a pas la reponse de la
  // tentative de reconnexion silencieuse, quand un numero est deja enregistre.
  const [verificationSession, setVerificationSession] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem('mos_chauffeur_telephone')
  )
  const positionRef = useRef<{ lat: number; lng: number } | null>(null)
  const ecranRef = useRef(ecran)
  const messagesRef = useRef<Message[]>([])
  // P1.6 : courses deja refusees ou en cours d'evaluation par CE chauffeur —
  // ne doivent jamais reapparaitre, meme quand le rayon de recherche
  // s'elargit avec le temps et que la mise a jour de la course est rediffusee.
  const ignoreesRef = useRef<Set<string>>(new Set())

  useEffect(() => { ecranRef.current = ecran }, [ecran])
  useEffect(() => { messagesRef.current = messages }, [messages])

  useEffect(() => {
    registerServiceWorker()
    if (typeof Notification !== 'undefined') setPermissionNotif(Notification.permission)
  }, [])

  async function activerNotifications() {
    if (typeof Notification === 'undefined') return
    const resultat = await Notification.requestPermission()
    setPermissionNotif(resultat)
    if (resultat === 'granted' && chauffeur) subscribeToPush(supabase, chauffeur.telephone)
  }

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
    if (!sauvegarde) { setVerificationSession(false); return }
    setTelephone(sauvegarde)
    supabase.rpc('connexion_chauffeur', { p_operateur_id: OPERATEUR_ID, p_telephone: sauvegarde }).then(({ data, error }) => {
      const trouve = data && data.length > 0 ? data[0] : null
      if (!error && trouve) {
        setChauffeur(trouve)
        setEcran('accueil')
        chargerHistorique(trouve.id, trouve.telephone)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribeToPush(supabase, trouve.telephone)
      }
      setVerificationSession(false)
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

  // Evalue une ligne "courses" recue (par Realtime ou par le sondage de
  // secours ci-dessous) et l'affiche comme demande si elle est pertinente
  // pour ce chauffeur. Factorise pour que les deux chemins appliquent
  // exactement la meme logique de filtrage.
  function evaluerCandidateCourse(c: any) {
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
        notifier('Nouvelle course !', `${c.adresse_depart} → ${c.adresse_arrivee} · ${c.prix_estime} DH`)
        // P1 (course_events) : journalise la proposition — n'affecte jamais
        // le dispatch lui-meme, purement pour l'audit trail.
        supabase.rpc('proposer_course', { p_course_id: c.id, p_chauffeur_id: prev.id, p_telephone: prev.telephone })
      }
      return prev
    })
  }

  // P1.6 : ecoute aussi bien la creation que les mises a jour d'une course —
  // le rayon de recherche s'elargit avec le temps (voir expirer_courses_en_
  // recherche cote serveur), donc une demande d'abord hors de portee peut
  // redevenir pertinente sans qu'une nouvelle ligne ne soit inseree.
  useEffect(() => {
    if (!chauffeur) return
    const channel = supabase
      .channel('chauffeur-' + chauffeur.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `operateur_id=eq.${OPERATEUR_ID}` }, (payload) => {
        evaluerCandidateCourse(payload.new as any)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chauffeur?.id])

  // Sondage de secours (meme cause reelle que cote passager, jamais couverte
  // ici jusqu'ici) : le canal Realtime seul ne suffit pas des que le websocket
  // se coupe (telephone verrouille, onglet en arriere-plan, reseau mobile
  // instable) — une course creee pendant la coupure n'est jamais rejouee par
  // Realtime a la reconnexion, elle est simplement perdue pour ce chauffeur.
  // Une requete directe toutes les 4s, plus un rattrapage immediat au retour
  // au premier plan, comble ce trou sans remplacer le canal Realtime.
  function rechercherCoursesEnAttente() {
    if (!chauffeur || !OPERATEUR_ID || chauffeur.statut !== 'disponible') return
    supabase.from('courses')
      .select('id,statut,adresse_depart,adresse_arrivee,prix_estime,depart_lat,depart_lng,rayon_recherche_km')
      .eq('operateur_id', OPERATEUR_ID)
      .eq('statut', 'en_recherche')
      .then(({ data }) => { (data || []).forEach(evaluerCandidateCourse) })
  }

  useEffect(() => {
    if (!chauffeur || chauffeur.statut !== 'disponible') return
    const intervalle = setInterval(rechercherCoursesEnAttente, 4000)
    return () => clearInterval(intervalle)
  }, [chauffeur?.id, chauffeur?.statut])

  useEffect(() => {
    if (!chauffeur) return
    function surRetourAuPremierPlan() {
      if (document.visibilityState === 'visible') rechercherCoursesEnAttente()
    }
    document.addEventListener('visibilitychange', surRetourAuPremierPlan)
    window.addEventListener('focus', surRetourAuPremierPlan)
    return () => {
      document.removeEventListener('visibilitychange', surRetourAuPremierPlan)
      window.removeEventListener('focus', surRetourAuPremierPlan)
    }
  }, [chauffeur?.id, chauffeur?.statut])

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
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribeToPush(supabase, trouve.telephone)
  }

  // P0.2 : verification OTP reelle avant connexion_chauffeur. Le code n'est
  // plus jamais renvoye par demander_otp() (correctif securite C-1, 2026-09-05
  // -- auparavant renvoye en clair dans la reponse RPC, ce qui permettait de
  // "verifier" n'importe quel numero sans jamais y avoir acces). Le code part
  // desormais uniquement par SMS reel une fois un fournisseur configure.
  async function demanderOtp() {
    setOtpErreur(null)
    setOtpEnCours(true)
    const { error } = await supabase.rpc('demander_otp', { p_telephone: telephone.replace(/\s/g, '') })
    setOtpEnCours(false)
    if (error) { setOtpErreur(error.message); return }
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

  function chargerMessages(courseId: string) {
    if (!chauffeur) return
    supabase.rpc('messages_course', { p_course_id: courseId, p_telephone: chauffeur.telephone })
      .then(({ data }) => {
        if (!data) return
        if (data.length > messagesRef.current.length) {
          const nouveaux: Message[] = data.slice(messagesRef.current.length)
          const dernierMessage = nouveaux[nouveaux.length - 1]
          if (dernierMessage.expediteur === 'passager' && (ecranRef.current !== 'messages' || document.hidden)) {
            notifier(contactPassager?.nom ? `Message de ${contactPassager.nom}` : 'Nouveau message', dernierMessage.contenu)
          }
        }
        setMessages(data)
      })
  }

  useEffect(() => {
    if (!courseActive || (ecran !== 'navigation' && ecran !== 'encours' && ecran !== 'messages')) return
    chargerMessages(courseActive.id)
    const intervalle = setInterval(() => chargerMessages(courseActive.id), 4000)
    return () => clearInterval(intervalle)
  }, [courseActive?.id, ecran])

  useEffect(() => {
    if (ecran === 'messages') setMessagesVues(messages.length)
  }, [messages, ecran])

  async function envoyerMessage() {
    if (!courseActive || !chauffeur || !messageTexte.trim() || envoiMessageEnCours) return
    const texte = messageTexte.trim()
    setMessageTexte('')
    setEnvoiMessageEnCours(true)
    await supabase.rpc('envoyer_message_course', { p_course_id: courseActive.id, p_telephone: chauffeur.telephone, p_contenu: texte })
    chargerMessages(courseActive.id)
    setEnvoiMessageEnCours(false)
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
    setContactPassager(null)
    setMessages([])
    setMessagesVues(0)
    // Le numero du passager n'est jamais lisible directement -- RPC qui
    // verifie que CE telephone est bien le chauffeur assigne a CETTE course
    // avant de renvoyer le contact de l'autre partie (meme pattern cote passager).
    supabase.rpc('obtenir_contact_course', { p_course_id: demande.id, p_telephone: chauffeur.telephone })
      .then(({ data }) => { if (data && data.length > 0) setContactPassager(data[0]) })
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
    setContactPassager(null)
    setMessages([])
    setMessagesVues(0)
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
    setOtpErreur(null)
    setEcran('connexion')
  }

  const gainsJour = historique
    .filter((c) => new Date(c.created_at).toDateString() === new Date().toDateString())
    .reduce((acc, c) => acc + Number(c.prix_final || 0), 0)

  const primary = operateur?.couleur_primaire || '#101B3D'
  const accent = operateur?.couleur_secondaire || '#FF7A28'
  const vars = {
    ['--primary' as any]: primary,
    ['--accent' as any]: accent,
    ['--primary-text' as any]: couleurTexteContrastee(primary),
    ['--accent-text' as any]: couleurTexteContrastee(accent),
  }

  if (chargementOperateur || verificationSession) return null
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
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setOtpEnvoye(false); setOtpCode(''); setOtpErreur(null) }}>
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
              {permissionNotif === 'default' && (
                <button className="btn ghost" style={{ marginBottom: 8 }} onClick={activerNotifications}>
                  🔔 Activer les notifications
                </button>
              )}
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
              {contactPassager && (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <a className="btn outline" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={`tel:${contactPassager.telephone}`}>
                    📞 Appeler {contactPassager.nom || 'le passager'}
                  </a>
                  <button className="btn accent" style={{ position: 'relative' }} onClick={() => { setEcranAvantMessages('navigation'); setEcran('messages') }}>
                    💬 Message
                    {messages.length > messagesVues && (
                      <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', borderRadius: 999, width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {messages.length - messagesVues}
                      </span>
                    )}
                  </button>
                </div>
              )}
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
              {contactPassager && (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <a className="btn outline" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={`tel:${contactPassager.telephone}`}>
                    📞 Appeler {contactPassager.nom || 'le passager'}
                  </a>
                  <button className="btn accent" style={{ position: 'relative' }} onClick={() => { setEcranAvantMessages('encours'); setEcran('messages') }}>
                    💬 Message
                    {messages.length > messagesVues && (
                      <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', borderRadius: 999, width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {messages.length - messagesVues}
                      </span>
                    )}
                  </button>
                </div>
              )}
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

        {ecran === 'messages' && courseActive && (
          <>
            <div className="screen-header">
              <strong>{contactPassager?.nom || 'Passager'}</strong>
              <button className="btn ghost" onClick={() => setEcran(ecranAvantMessages)}>Retour</button>
            </div>
            <div className="screen-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && <p className="muted center">Aucun message pour l&apos;instant. Écrivez à votre passager ci-dessous.</p>}
              {messages.map((m) => (
                <div key={m.id} style={{
                  alignSelf: m.expediteur === 'chauffeur' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  background: m.expediteur === 'chauffeur' ? 'var(--primary)' : '#F0F0F0',
                  color: m.expediteur === 'chauffeur' ? 'var(--primary-text, #fff)' : 'var(--text)',
                  borderRadius: 14, padding: '8px 12px',
                }}>
                  <div style={{ fontSize: 14 }}>{m.contenu}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
            <div className="screen-footer">
              <div className="btn-row">
                <input type="text" value={messageTexte} onChange={(e) => setMessageTexte(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') envoyerMessage() }}
                  placeholder="Votre message…" style={{ marginBottom: 0, flex: 1 }} />
                <button className="btn accent" style={{ width: 'auto', padding: '0 20px' }} onClick={envoyerMessage} disabled={!messageTexte.trim() || envoiMessageEnCours}>
                  Envoyer
                </button>
              </div>
            </div>
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
