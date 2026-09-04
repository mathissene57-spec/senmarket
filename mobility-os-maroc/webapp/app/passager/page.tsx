'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { distanceHaversineKm } from '@/lib/geo'
import { useOperateurId } from '@/lib/useOperateurId'
import { registerServiceWorker, notifier, subscribeToPush } from '@/lib/notifications'

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
type Chauffeur = { id: string; nom: string; vehicule: string | null; plaque: string | null; note_moyenne: number; nb_courses: number }
type Contact = { nom: string; telephone: string }
type Avis = { note: number; commentaire: string | null; created_at: string }
type Message = { id: string; expediteur: 'passager' | 'chauffeur'; contenu: string; created_at: string }

// Confiance passager (demande produit) : au-dela de la simple moyenne, un
// badge textuel resume d'un coup d'oeil le niveau de confiance -- absent
// pour un chauffeur encore sans historique plutot que de le presenter
// comme "mauvais" faute de donnees.
function badgeConfiance(chauffeur: Chauffeur): { label: string; classe: string } | null {
  if (chauffeur.nb_courses === 0) return { label: 'Nouveau chauffeur', classe: 'off' }
  if (chauffeur.note_moyenne >= 4.5 && chauffeur.nb_courses >= 10) return { label: '🏆 Chauffeur excellent', classe: 'ok' }
  if (chauffeur.note_moyenne >= 4) return { label: '✓ Chauffeur fiable', classe: 'ok' }
  if (chauffeur.note_moyenne < 3) return { label: 'Note en baisse', classe: 'warn' }
  return null
}

// Un operateur choisit librement ses couleurs primaire/secondaire (onboarding,
// puis Parametres du dashboard) -- le texte blanc fixe des boutons devenait
// invisible des qu'un operateur choisissait une couleur claire (ex: blanc),
// constate en reel sur l'operateur pilote TransAtlas (couleur_secondaire =
// #ffffff, bouton "Commander" illisible). Bascule le texte en fonce/clair
// selon la luminance percue de la couleur de fond.
function couleurTexteContrastee(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#FFFFFF'
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance > 150 ? '#101B3D' : '#FFFFFF'
}

export default function PassagerPage() {
  const supabase = createClient()
  const { operateurId: OPERATEUR_ID, chargement: chargementOperateur, erreur: erreurResolution } = useOperateurId()
  const [operateur, setOperateur] = useState<Operateur | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneId, setZoneId] = useState<string>('')
  const [ecran, setEcran] = useState<'connexion' | 'accueil' | 'recherche' | 'course' | 'fin' | 'historique' | 'sans_chauffeur' | 'avis' | 'messages'>('connexion')
  const [telephone, setTelephone] = useState('06 61 22 33 44')
  const [nom, setNom] = useState('')
  const [depart, setDepart] = useState('Position actuelle — Boulevard Zerktouni')
  const [arrivee, setArrivee] = useState('Gare Casa-Voyageurs')
  const [course, setCourse] = useState<Course | null>(null)
  const [chauffeur, setChauffeur] = useState<Chauffeur | null>(null)
  const [contactChauffeur, setContactChauffeur] = useState<Contact | null>(null)
  const [note, setNote] = useState(0)
  const [commentaireAvis, setCommentaireAvis] = useState('')
  const [avisListe, setAvisListe] = useState<Avis[]>([])
  const [avisChargement, setAvisChargement] = useState(false)
  const [ecranPrecedent, setEcranPrecedent] = useState<'course' | 'fin'>('course')
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesVues, setMessagesVues] = useState(0)
  const [messageTexte, setMessageTexte] = useState('')
  const [envoiMessageEnCours, setEnvoiMessageEnCours] = useState(false)
  const [historique, setHistorique] = useState<Course[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [pointDepart, setPointDepart] = useState(POINT_DEPART_DEFAUT)
  const [pointArrivee, setPointArrivee] = useState(POINT_ARRIVEE_DEFAUT)
  const [repereEnCours, setRepereEnCours] = useState(false)
  const [otpEnvoye, setOtpEnvoye] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpCodeDebug, setOtpCodeDebug] = useState<string | null>(null)
  const [otpEnCours, setOtpEnCours] = useState(false)
  const [otpErreur, setOtpErreur] = useState<string | null>(null)
  const [permissionNotif, setPermissionNotif] = useState<NotificationPermission | 'indisponible'>('indisponible')
  const courseRef = useRef<Course | null>(null)
  const ecranRef = useRef(ecran)
  const messagesRef = useRef<Message[]>([])

  useEffect(() => {
    registerServiceWorker()
    if (typeof Notification !== 'undefined') setPermissionNotif(Notification.permission)
  }, [])

  async function activerNotifications() {
    if (typeof Notification === 'undefined') return
    const resultat = await Notification.requestPermission()
    setPermissionNotif(resultat)
    if (resultat === 'granted') subscribeToPush(supabase, telephone)
  }

  useEffect(() => { ecranRef.current = ecran }, [ecran])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // P0.2 (confort) : le telephone verifie reste valide 24h cote serveur,
  // mais l'ecran revenait a "connexion" a chaque rechargement faute d'etat
  // persiste. On retente une sonde silencieuse (RPC deja existante, lecture
  // seule) avec le dernier telephone connu : si le serveur le considere
  // toujours verifie, on saute directement a l'accueil.
  useEffect(() => {
    const sauvegarde = typeof window !== 'undefined' ? localStorage.getItem('mos_passager_telephone') : null
    if (!sauvegarde) return
    setTelephone(sauvegarde)
    supabase.rpc('historique_passager', { p_telephone: sauvegarde }).then(({ error }) => {
      if (!error) {
        setEcran('accueil')
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribeToPush(supabase, sauvegarde)
      }
    })
  }, [])

  useEffect(() => {
    if (!OPERATEUR_ID) return
    supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire').eq('id', OPERATEUR_ID).single()
      .then(({ data }) => setOperateur(data))
    supabase.from('zones_operateur').select('id,nom,tarif_base,tarif_km').eq('operateur_id', OPERATEUR_ID).order('nom')
      .then(({ data }) => {
        setZones(data || [])
        if (data && data.length > 0) setZoneId(data[0].id)
      })
  }, [OPERATEUR_ID])

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

  // Applique une mise a jour de course (statut/chauffeur_id) recue par le
  // canal Realtime OU par le sondage de secours ci-dessous. Factorise pour
  // que les deux chemins produisent exactement la meme transition d'ecran.
  function appliquerMiseAJourCourse(updated: Course) {
    // Capture avant setCourse : courseRef reflete encore le dernier statut
    // committe (mis a jour par l'effet ci-dessous apres chaque rendu), donc
    // fiable pour ne notifier qu'un vrai changement -- sans ca, le sondage
    // toutes les 4s redeclencherait la meme notification en boucle.
    const statutPrecedent = courseRef.current?.statut
    setCourse((precedent) => {
      if (updated.chauffeur_id && updated.chauffeur_id !== precedent?.chauffeur_id) {
        supabase.from('chauffeurs').select('id,nom,vehicule,plaque,note_moyenne,nb_courses').eq('id', updated.chauffeur_id).single()
          .then(({ data }) => setChauffeur(data))
        // Le numero du chauffeur n'est jamais lisible directement (colonne
        // exclue du GRANT anon, c'est son identifiant de connexion) -- on
        // passe par une RPC qui verifie que CE telephone est bien le passager
        // de CETTE course avant de renvoyer le contact de l'autre partie.
        supabase.rpc('obtenir_contact_course', { p_course_id: updated.id, p_telephone: telephone })
          .then(({ data }) => { if (data && data.length > 0) setContactChauffeur(data[0]) })
      }
      return updated
    })
    if (statutPrecedent !== updated.statut) {
      if (updated.statut === 'assignee') notifier('Chauffeur trouvé', 'Un chauffeur a accepté votre course et arrive.')
      else if (updated.statut === 'en_cours') notifier('En route', 'Votre chauffeur est arrivé, la course a commencé.')
      else if (updated.statut === 'terminee') notifier('Course terminée', 'Vous êtes arrivé à destination.')
      else if (updated.statut === 'sans_chauffeur') notifier('Aucun chauffeur disponible', "Personne n'a accepté votre demande, réessayez.")
      else if (updated.statut === 'annulee') notifier('Course annulée', 'Votre course a été annulée.')
    }
    if (updated.statut === 'assignee' || updated.statut === 'en_cours') {
      setEcran('course')
    } else if (updated.statut === 'terminee') {
      setEcran('fin')
    } else if (updated.statut === 'sans_chauffeur' || updated.statut === 'annulee') {
      setEcran('sans_chauffeur')
    }
  }

  useEffect(() => {
    if (!course) return
    const channel = supabase
      .channel('passager-course-' + course.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courses', filter: `id=eq.${course.id}` }, (payload) => {
        appliquerMiseAJourCourse(payload.new as Course)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [course?.id])

  function reverifierCourse(courseId: string) {
    supabase.from('courses').select('id,statut,adresse_depart,adresse_arrivee,prix_estime,prix_final,chauffeur_id')
      .eq('id', courseId).single()
      .then(({ data }) => { if (data) appliquerMiseAJourCourse(data as Course) })
  }

  // Sondage de secours (finition UX) : le radar de recherche restait bloque
  // a l'ecran meme apres acceptation par un chauffeur -- le canal Realtime
  // seul ne suffit pas dans certains cas reels (onglet mis en arriere-plan
  // sur mobile qui coupe le websocket, reconnexion manquee, minuscule
  // fenetre de course entre l'appel RPC et l'etablissement de l'abonnement).
  // Une requete directe toutes les 4s vient combler ces trous sans remplacer
  // le canal Realtime, qui reste le chemin instantane quand tout va bien.
  useEffect(() => {
    if (!course || (ecran !== 'recherche' && ecran !== 'course')) return
    const intervalle = setInterval(() => reverifierCourse(course.id), 4000)
    return () => clearInterval(intervalle)
  }, [course?.id, ecran])

  // Reprise sur retour au premier plan (finition UX, cause reelle constatee
  // en test terrain) : les navigateurs mobiles suspendent les setInterval
  // ET coupent le websocket Realtime des qu'un onglet passe en arriere-plan
  // (l'utilisateur bascule sur WhatsApp pour contacter son chauffeur, verrouille
  // son telephone, etc.) -- le sondage toutes les 4s ci-dessus ne s'execute
  // simplement plus tant que l'onglet n'est pas revenu au premier plan. On
  // revient donc les rattraper explicitement des que l'onglet redevient visible,
  // au lieu d'attendre un minuteur qui ne tournait pas.
  useEffect(() => {
    if (!course) return
    function surRetourAuPremierPlan() {
      if (document.visibilityState === 'visible') reverifierCourse(course!.id)
    }
    document.addEventListener('visibilitychange', surRetourAuPremierPlan)
    window.addEventListener('focus', surRetourAuPremierPlan)
    return () => {
      document.removeEventListener('visibilitychange', surRetourAuPremierPlan)
      window.removeEventListener('focus', surRetourAuPremierPlan)
    }
  }, [course?.id])

  // Messagerie interne (demande produit : ne pas dependre du numero
  // WhatsApp du passager/chauffeur, qui ne correspond pas forcement au
  // numero utilise pour s'inscrire). Aucun acces direct a la table cote
  // Supabase (RLS deny-all) -- tout passe par ces deux RPC, donc pas de
  // canal Realtime possible ici : sondage periodique, meme pattern que
  // le suivi de statut de la course ci-dessus.
  function chargerMessages(courseId: string) {
    supabase.rpc('messages_course', { p_course_id: courseId, p_telephone: telephone })
      .then(({ data }) => {
        if (!data) return
        if (data.length > messagesRef.current.length) {
          const nouveaux: Message[] = data.slice(messagesRef.current.length)
          const dernierMessage = nouveaux[nouveaux.length - 1]
          // Pas de notification si la conversation est deja affichee a l'ecran
          // (onglet au premier plan) -- seulement en arriere-plan ou ailleurs
          // dans l'appli, comme une vraie messagerie.
          if (dernierMessage.expediteur === 'chauffeur' && (ecranRef.current !== 'messages' || document.hidden)) {
            notifier(chauffeur?.nom ? `Message de ${chauffeur.nom}` : 'Nouveau message', dernierMessage.contenu)
          }
        }
        setMessages(data)
      })
  }

  useEffect(() => {
    if (!course || (ecran !== 'course' && ecran !== 'messages')) return
    chargerMessages(course.id)
    const intervalle = setInterval(() => chargerMessages(course.id), 4000)
    return () => clearInterval(intervalle)
  }, [course?.id, ecran])

  // La messagerie n'a pas son propre visibilitychange -- elle ne tourne
  // que pendant que l'ecran course/messages est deja affiche, et le
  // rattrapage de course ci-dessus (qui appelle reverifierCourse) suffit
  // a reactiver ce useEffect en le laissant simplement continuer son cours
  // des que l'onglet redevient visible.
  useEffect(() => {
    if (ecran === 'messages') setMessagesVues(messages.length)
  }, [messages, ecran])

  async function envoyerMessage() {
    if (!course || !messageTexte.trim() || envoiMessageEnCours) return
    const texte = messageTexte.trim()
    setMessageTexte('')
    setEnvoiMessageEnCours(true)
    await supabase.rpc('envoyer_message_course', { p_course_id: course.id, p_telephone: telephone, p_contenu: texte })
    chargerMessages(course.id)
    setEnvoiMessageEnCours(false)
  }

  const zone = zones.find((z) => z.id === zoneId) || null
  // Estimation affichee avant envoi, a partir des points deja geocodes —
  // uniquement indicative : le prix qui compte vraiment est celui que le
  // serveur recalcule dans creer_course a partir des memes coordonnees,
  // jamais celui envoye par le navigateur (voir audit du 2026-09-02, §9).
  const distanceEstimeeKm = distanceHaversineKm(pointDepart, pointArrivee)
  const prixEstime = zone ? Math.round((Number(zone.tarif_base) + Number(zone.tarif_km) * distanceEstimeeKm) * 100) / 100 : 0

  async function commander() {
    if (!zoneId || !OPERATEUR_ID) return
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
    setChauffeur(null)
    setContactChauffeur(null)
    setMessages([])
    setMessagesVues(0)
    setCourse({ id: cree.id, statut: 'en_recherche', adresse_depart: depart, adresse_arrivee: arrivee, prix_estime: cree.prix_estime, prix_final: null, chauffeur_id: null })
    setEcran('recherche')
  }

  async function annulerCommande() {
    if (course) await supabase.rpc('annuler_course', { p_course_id: course.id, p_telephone: telephone })
    setCourse(null)
    setContactChauffeur(null)
    setEcran('accueil')
  }

  async function envoyerNote() {
    if (!course) return
    if (note > 0) {
      await supabase.rpc('noter_course', { p_course_id: course.id, p_telephone: telephone, p_note: note, p_commentaire: commentaireAvis })
    }
    setCommentaireAvis('')
    await chargerHistorique()
    setEcran('historique')
  }

  async function chargerHistorique() {
    const { data } = await supabase.rpc('historique_passager', { p_telephone: telephone })
    setHistorique(data || [])
  }

  // Confiance passager (demande produit) : le passager doit pouvoir consulter
  // le detail des avis recus par un chauffeur, pas seulement sa moyenne.
  // Accessible depuis l'ecran "course" (avant meme la fin du trajet) et
  // depuis l'ecran "fin", d'ou surRetourAvis() sait vers lequel revenir.
  async function ouvrirAvis(depuis: 'course' | 'fin') {
    if (!chauffeur) return
    setEcranPrecedent(depuis)
    setAvisChargement(true)
    setEcran('avis')
    const { data } = await supabase.rpc('avis_chauffeur', { p_chauffeur_id: chauffeur.id })
    setAvisListe(data || [])
    setAvisChargement(false)
  }

  // P0.2 : verification OTP reelle avant d'entrer dans l'app. SMS stubbe —
  // aucun fournisseur configure — demander_otp() renvoie le code en clair,
  // affiche ici dans un bandeau "mode demo" au lieu d'un SMS reel.
  async function demanderOtp() {
    setOtpErreur(null)
    setOtpEnCours(true)
    const { data, error } = await supabase.rpc('demander_otp', { p_telephone: telephone })
    setOtpEnCours(false)
    if (error) { setOtpErreur(error.message); return }
    setOtpCodeDebug(data as string)
    setOtpEnvoye(true)
  }

  async function verifierOtpEtContinuer() {
    setOtpErreur(null)
    setOtpEnCours(true)
    const { data, error } = await supabase.rpc('verifier_otp', { p_telephone: telephone, p_code: otpCode })
    setOtpEnCours(false)
    if (error) { setOtpErreur(error.message); return }
    if (!data) { setOtpErreur('Code incorrect.'); return }
    if (typeof window !== 'undefined') localStorage.setItem('mos_passager_telephone', telephone)
    setEcran('accueil')
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribeToPush(supabase, telephone)
  }

  const primary = operateur?.couleur_primaire || '#101B3D'
  const accent = operateur?.couleur_secondaire || '#FF7A28'
  const vars = {
    ['--primary' as any]: primary,
    ['--accent' as any]: accent,
    ['--primary-text' as any]: couleurTexteContrastee(primary),
    ['--accent-text' as any]: couleurTexteContrastee(accent),
  }

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
            <h2 style={{ marginBottom: 4 }}>{operateur?.nom || 'Mobility OS'}</h2>
            <p className="muted">Réservez une course en quelques secondes</p>
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <label className="field-label">Numéro de téléphone</label>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} disabled={otpEnvoye} />
              {!otpEnvoye && (
                <>
                  <label className="field-label">Nom (optionnel)</label>
                  <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" />
                </>
              )}
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
            {otpErreur && <p className="error-text">{otpErreur}</p>}
            {!otpEnvoye ? (
              <button className="btn" onClick={demanderOtp} disabled={!telephone.trim() || otpEnCours}>
                {otpEnCours ? 'Envoi…' : 'Recevoir un code'}
              </button>
            ) : (
              <>
                <button className="btn" onClick={verifierOtpEtContinuer} disabled={otpCode.length !== 6 || otpEnCours}>
                  {otpEnCours ? 'Vérification…' : 'Confirmer'}
                </button>
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setOtpEnvoye(false); setOtpCode(''); setOtpCodeDebug(null); setOtpErreur(null) }}>
                  Changer de numéro
                </button>
              </>
            )}
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
              {permissionNotif === 'default' && (
                <button className="btn ghost" style={{ marginTop: 4 }} onClick={activerNotifications}>
                  🔔 Activer les notifications
                </button>
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
                <div className="card">
                  <div className="card-row">
                    <div><strong>{chauffeur.nom}</strong><div className="muted">{chauffeur.vehicule} · {chauffeur.plaque}</div></div>
                    <span>⭐ {chauffeur.note_moyenne}</span>
                  </div>
                  <div className="card-row" style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="muted">{chauffeur.nb_courses} course{chauffeur.nb_courses !== 1 ? 's' : ''} effectuée{chauffeur.nb_courses !== 1 ? 's' : ''}</span>
                      {badgeConfiance(chauffeur) && (
                        <span className={`badge ${badgeConfiance(chauffeur)!.classe}`}>{badgeConfiance(chauffeur)!.label}</span>
                      )}
                    </div>
                    <button className="btn ghost" style={{ width: 'auto', padding: '4px 0', fontSize: 13 }} onClick={() => ouvrirAvis('course')}>
                      Voir les avis
                    </button>
                  </div>
                </div>
              )}
              <div className="btn-row" style={{ marginBottom: 12 }}>
                <button className="btn accent" style={{ position: 'relative' }} onClick={() => setEcran('messages')}>
                  💬 Message
                  {messages.length > messagesVues && (
                    <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', borderRadius: 999, width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {messages.length - messagesVues}
                    </span>
                  )}
                </button>
                {contactChauffeur && (
                  <a className="btn outline" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={`tel:${contactChauffeur.telephone}`}>
                    📞 Appeler
                  </a>
                )}
              </div>
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
                {note > 0 && (
                  <textarea
                    value={commentaireAvis}
                    onChange={(e) => setCommentaireAvis(e.target.value)}
                    placeholder="Un commentaire pour les prochains passagers ? (optionnel)"
                    rows={3}
                    style={{ width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid #DDD', fontSize: 14, fontFamily: 'inherit', resize: 'none' }}
                  />
                )}
              </div>
              {chauffeur && (
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => ouvrirAvis('fin')}>
                  Voir les avis sur ce chauffeur
                </button>
              )}
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

        {ecran === 'avis' && (
          <>
            <div className="screen-header">
              <strong>Avis sur {chauffeur?.nom || 'ce chauffeur'}</strong>
              <button className="btn ghost" onClick={() => setEcran(ecranPrecedent)}>Retour</button>
            </div>
            <div className="screen-body">
              {chauffeur && (
                <div className="card card-row" style={{ marginBottom: 16 }}>
                  <span>⭐ {chauffeur.note_moyenne} de moyenne</span>
                  <span className="muted">{chauffeur.nb_courses} course{chauffeur.nb_courses !== 1 ? 's' : ''}</span>
                </div>
              )}
              {avisChargement && <p className="muted">Chargement…</p>}
              {!avisChargement && avisListe.length === 0 && (
                <p className="muted">Aucun avis pour l&apos;instant — soyez le premier à en laisser un après votre course.</p>
              )}
              {!avisChargement && avisListe.map((a, i) => (
                <div key={i} className="card">
                  <div className="stars" style={{ fontSize: 18, letterSpacing: 2, cursor: 'default' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`star${a.note >= n ? ' filled' : ''}`} style={{ cursor: 'default' }}>★</span>
                    ))}
                  </div>
                  {a.commentaire && <p style={{ margin: '8px 0 4px' }}>{a.commentaire}</p>}
                  <div className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {ecran === 'messages' && course && (
          <>
            <div className="screen-header">
              <strong>{chauffeur?.nom || 'Chauffeur'}</strong>
              <button className="btn ghost" onClick={() => setEcran('course')}>Retour</button>
            </div>
            <div className="screen-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && <p className="muted center">Aucun message pour l&apos;instant. Écrivez à votre chauffeur ci-dessous.</p>}
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.expediteur === 'passager' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: m.expediteur === 'passager' ? 'var(--primary)' : '#F0F0F0',
                    color: m.expediteur === 'passager' ? 'var(--primary-text, #fff)' : 'var(--text)',
                    borderRadius: 14,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ fontSize: 14 }}>{m.contenu}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
            <div className="screen-footer">
              <div className="btn-row">
                <input
                  type="text"
                  value={messageTexte}
                  onChange={(e) => setMessageTexte(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') envoyerMessage() }}
                  placeholder="Votre message…"
                  style={{ marginBottom: 0, flex: 1 }}
                />
                <button className="btn accent" style={{ width: 'auto', padding: '0 20px' }} onClick={envoyerMessage} disabled={!messageTexte.trim() || envoiMessageEnCours}>
                  Envoyer
                </button>
              </div>
            </div>
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
    </div>
  )
}
