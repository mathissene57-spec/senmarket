'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { distanceHaversineKm } from '@/lib/geo'
import { useOperateurId } from '@/lib/useOperateurId'
import { registerServiceWorker, notifier, subscribeToPush } from '@/lib/notifications'
import { useAppelInterne } from '@/lib/useAppelInterne'

const Carte = dynamic(() => import('@/components/Carte'), { ssr: false })

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string; logo_url: string | null }
type ChauffeurRow = { id: string; nom: string; telephone: string; statut: string; type_vehicule: string }
type CourseNotif = {
  id: string
  adresse_depart: string
  adresse_arrivee: string
  prix_estime: number
  statut: string
  distance_km?: number
  depart_lat?: number | null
  depart_lng?: number | null
  arrivee_lat?: number | null
  arrivee_lng?: number | null
  type_vehicule?: string
  type_course?: string
}
type CourseTerminee = { id: string; adresse_depart: string; adresse_arrivee: string; prix_final: number | null; created_at: string }
type Contact = { nom: string; telephone: string }
type Message = { id: string; expediteur: 'passager' | 'chauffeur'; contenu: string | null; type: 'texte' | 'image' | 'audio'; media_path: string | null; created_at: string }

// P17 : messagerie course -- photo + note vocale, en plus du texte. Le
// bucket "messages-media" est public (voir migration p16), donc l'URL se
// construit directement a partir du chemin renvoye par l'API sans etape
// supplementaire (pas de signature a demander).
const URL_BASE_MEDIA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/messages-media`

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

// Marque (logo_url deja present en base mais jamais affiche -- seule
// l'initiale du nom sur fond colore existait). Repli sur l'initiale si aucun
// logo n'est renseigne, ou si l'image echoue a charger (URL cassee).
function Marque({ nom, logoUrl, grande }: { nom?: string | null; logoUrl?: string | null; grande?: boolean }) {
  const [enErreur, setEnErreur] = useState(false)
  const classe = `brand-mark${grande ? ' brand-mark-lg' : ''}`
  if (logoUrl && !enErreur) {
    return <img src={logoUrl} alt={nom || ''} className={classe} style={{ objectFit: 'cover' }} onError={() => setEnErreur(true)} />
  }
  return <span className={classe}>{nom?.[0] || 'M'}</span>
}

export default function ChauffeurPage() {
  const supabase = createClient()
  const router = useRouter()
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
  // Qui a cloture la course active : distingue l'ecran "fin" normal (le
  // chauffeur a lui-meme termine) du cas ou le passager a mis fin a la
  // course a distance, a n'importe quelle etape -- l'affichage et le
  // message different, meme si le retour a l'accueil est identique.
  const [finRaison, setFinRaison] = useState<'chauffeur' | 'passager_terminee' | 'passager_annulee'>('chauffeur')
  const [historique, setHistorique] = useState<CourseTerminee[]>([])
  const [message, setMessage] = useState<string | null>(null)
  // Position reelle du chauffeur (pas seulement un booleen "connue") --
  // necessaire pour afficher une vraie carte (correctif : la carte ne
  // s'affichait jamais cote chauffeur, l'ecran ne montrait qu'un fond
  // decoratif .map-placeholder vide, contrairement a l'app passager).
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [otpEnvoye, setOtpEnvoye] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpEnCours, setOtpEnCours] = useState(false)
  const [otpErreur, setOtpErreur] = useState<string | null>(null)
  const [ecranAvantMessages, setEcranAvantMessages] = useState<'navigation' | 'encours'>('navigation')
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesVues, setMessagesVues] = useState(0)
  const [messageTexte, setMessageTexte] = useState('')
  const [envoiMessageEnCours, setEnvoiMessageEnCours] = useState(false)
  const [envoiMediaEnCours, setEnvoiMediaEnCours] = useState(false)
  const [enregistrementVocal, setEnregistrementVocal] = useState(false)
  const [dureeEnregistrement, setDureeEnregistrement] = useState(0)
  const [erreurMedia, setErreurMedia] = useState<string | null>(null)
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
  // Appel interne (demande produit) : audio WebRTC direct avec le passager,
  // sans jamais exposer le vrai numero de l'un a l'autre -- voir
  // lib/useAppelInterne.ts.
  const appel = useAppelInterne(supabase, courseActive?.id, chauffeur?.nom || 'Chauffeur')
  const positionRef = useRef<{ lat: number; lng: number } | null>(null)
  const ecranRef = useRef(ecran)
  const courseActiveRef = useRef(courseActive)
  const messagesRef = useRef<Message[]>([])
  // P1.6 : courses deja refusees ou en cours d'evaluation par CE chauffeur —
  // ne doivent jamais reapparaitre, meme quand le rayon de recherche
  // s'elargit avec le temps et que la mise a jour de la course est rediffusee.
  const ignoreesRef = useRef<Set<string>>(new Set())
  const fichierPhotoRef = useRef<HTMLInputElement>(null)
  const enregistreurVocalRef = useRef<MediaRecorder | null>(null)
  const morceauxVocalRef = useRef<BlobPart[]>([])
  const minuteurVocalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { ecranRef.current = ecran }, [ecran])
  useEffect(() => { courseActiveRef.current = courseActive }, [courseActive])
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
    supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire,logo_url').eq('id', OPERATEUR_ID).single()
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
        setPosition(point)
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
      // Filtrage par type de vehicule (P11, demande produit) : un chauffeur
      // moto ne doit jamais voir une course voiture et inversement -- chaque
      // course snapshote le type demande par le passager a la commande.
      if (prev && prev.statut === 'disponible' && (c.type_vehicule || 'voiture') === prev.type_vehicule) {
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
        setDemande({
          id: c.id,
          adresse_depart: c.adresse_depart,
          adresse_arrivee: c.adresse_arrivee,
          prix_estime: c.prix_estime,
          statut: c.statut,
          distance_km: distance ?? undefined,
          depart_lat: c.depart_lat,
          depart_lng: c.depart_lng,
          arrivee_lat: c.arrivee_lat,
          arrivee_lng: c.arrivee_lng,
          type_vehicule: c.type_vehicule,
          type_course: c.type_course,
        })
        setEcran('demande')
        notifier('Nouvelle course !', `${c.adresse_depart} → ${c.adresse_arrivee} · ${c.prix_estime} DH`)
        // P1 (course_events) : journalise la proposition — n'affecte jamais
        // le dispatch lui-meme, purement pour l'audit trail.
        supabase.rpc('proposer_course', { p_course_id: c.id, p_chauffeur_id: prev.id, p_telephone: prev.telephone })
      }
      return prev
    })
  }

  // Detecte la cloture a distance de la course active du chauffeur : le
  // passager peut mettre fin a la course a n'importe quelle etape
  // (en_recherche/assignee/en_cours -> annulee, ou en_cours -> terminee via
  // passager_terminer_course/annuler_course cote serveur). Le serveur libere
  // deja chauffeurs.statut a ce moment-la, mais sans ceci l'ecran du
  // chauffeur restait bloque indefiniment sur navigation/encours, sans le
  // moindre signal, et sans jamais redevenir disponible pour une nouvelle
  // course cote UI.
  function evaluerClotureCourseActive(c: any) {
    const active = courseActiveRef.current
    if (!active || c.id !== active.id) return
    if (c.statut !== 'terminee' && c.statut !== 'annulee') return
    if (!['navigation', 'encours', 'messages'].includes(ecranRef.current)) return
    setFinRaison(c.statut === 'terminee' ? 'passager_terminee' : 'passager_annulee')
    setPrixTermine(c.statut === 'terminee' ? (c.prix_final ?? c.prix_estime ?? active.prix_estime) : 0)
    setChauffeur((prev) => (prev ? { ...prev, statut: 'disponible' } : prev))
    setContactPassager(null)
    setMessages([])
    setMessagesVues(0)
    setEcran('fin')
    notifier(
      c.statut === 'terminee' ? 'Course terminée' : 'Course annulée',
      'Le passager a mis fin à la course. Vous êtes de nouveau disponible.'
    )
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
        evaluerClotureCourseActive(payload.new as any)
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
      .select('id,statut,adresse_depart,adresse_arrivee,prix_estime,depart_lat,depart_lng,arrivee_lat,arrivee_lng,rayon_recherche_km,type_vehicule,type_course')
      .eq('operateur_id', OPERATEUR_ID)
      .eq('statut', 'en_recherche')
      .then(({ data }) => { (data || []).forEach(evaluerCandidateCourse) })
  }

  useEffect(() => {
    if (!chauffeur || chauffeur.statut !== 'disponible') return
    rechercherCoursesEnAttente()
    const intervalle = setInterval(rechercherCoursesEnAttente, 4000)
    return () => clearInterval(intervalle)
  }, [chauffeur?.id, chauffeur?.statut])

  // Meme filet de securite que rechercherCoursesEnAttente ci-dessus, mais
  // pour la course active elle-meme : si le passager la cloture pendant
  // que l'onglet est en arriere-plan (websocket Realtime suspendu par le
  // navigateur mobile), le seul canal Realtime ne suffit pas -- un sondage
  // direct comble le meme trou que pour la reception des nouvelles courses.
  function verifierCourseActive() {
    const active = courseActiveRef.current
    if (!active || !['navigation', 'encours', 'messages'].includes(ecranRef.current)) return
    supabase.from('courses').select('id,statut,prix_estime,prix_final').eq('id', active.id).maybeSingle()
      .then(({ data }) => { if (data) evaluerClotureCourseActive(data) })
  }

  useEffect(() => {
    if (!courseActive) return
    verifierCourseActive()
    const intervalle = setInterval(verifierCourseActive, 4000)
    return () => clearInterval(intervalle)
  }, [courseActive?.id])

  useEffect(() => {
    if (!chauffeur) return
    function surRetourAuPremierPlan() {
      if (document.visibilityState === 'visible') { rechercherCoursesEnAttente(); verifierCourseActive() }
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
            const apercu = dernierMessage.type === 'image' ? '📷 Photo' : dernierMessage.type === 'audio' ? '🎤 Note vocale' : dernierMessage.contenu || ''
            notifier(contactPassager?.nom ? `Message de ${contactPassager.nom}` : 'Nouveau message', apercu)
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

  // P17 : photo + note vocale dans la messagerie course. Upload direct dans
  // le bucket public "messages-media" (chemin imprevisible, voir migration
  // p16), puis meme RPC envoyer_message_course que le texte avec
  // p_type/p_media_path. try/catch + erreurs remontees explicitement --
  // sans ca, une exception (ex: API indisponible sur un vieux navigateur)
  // ou une erreur RPC restait totalement invisible pour l'utilisateur.
  function idAleatoire(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
  async function envoyerMedia(fichier: File, type: 'image' | 'audio') {
    if (!courseActive || !chauffeur || envoiMediaEnCours) return
    setErreurMedia(null)
    setEnvoiMediaEnCours(true)
    try {
      const extension = fichier.name.split('.').pop() || (type === 'image' ? 'jpg' : 'webm')
      const chemin = `${courseActive.id}/${idAleatoire()}.${extension}`
      const { error: erreurUpload } = await supabase.storage.from('messages-media').upload(chemin, fichier, {
        contentType: fichier.type || undefined,
      })
      if (erreurUpload) { setErreurMedia(`Envoi impossible : ${erreurUpload.message}`); return }
      const { error: erreurEnvoi } = await supabase.rpc('envoyer_message_course', {
        p_course_id: courseActive.id, p_telephone: chauffeur.telephone, p_contenu: null, p_type: type, p_media_path: chemin,
      })
      if (erreurEnvoi) { setErreurMedia(`Envoi impossible : ${erreurEnvoi.message}`); return }
      chargerMessages(courseActive.id)
    } catch {
      setErreurMedia("Envoi impossible. Verifiez votre connexion et reessayez.")
    } finally {
      setEnvoiMediaEnCours(false)
    }
  }

  function choisirPhoto(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (fichier) envoyerMedia(fichier, 'image')
  }

  async function toggleEnregistrementVocal() {
    if (enregistrementVocal) {
      enregistreurVocalRef.current?.stop()
      return
    }
    setErreurMedia(null)
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined
      const enregistreur = new MediaRecorder(flux, mimeType ? { mimeType } : undefined)
      morceauxVocalRef.current = []
      enregistreur.ondataavailable = (e) => { if (e.data.size > 0) morceauxVocalRef.current.push(e.data) }
      enregistreur.onstop = () => {
        flux.getTracks().forEach((t) => t.stop())
        if (minuteurVocalRef.current) { clearInterval(minuteurVocalRef.current); minuteurVocalRef.current = null }
        setEnregistrementVocal(false)
        setDureeEnregistrement(0)
        const typeBlob = enregistreur.mimeType || 'audio/webm'
        const blob = new Blob(morceauxVocalRef.current, { type: typeBlob })
        const extension = typeBlob.includes('mp4') ? 'm4a' : 'webm'
        envoyerMedia(new File([blob], `note-vocale.${extension}`, { type: typeBlob }), 'audio')
      }
      enregistreurVocalRef.current = enregistreur
      // Safari/iOS declenche parfois onstop avant que le dernier
      // ondataavailable n'ait livre les donnees quand start() n'a pas de
      // timeslice -- resultat observe en test reel : des notes vocales
      // enregistrees en 0 octet malgre un message cree normalement. Un
      // timeslice force des flux intermediaires reguliers pendant
      // l'enregistrement, qui ne dependent plus uniquement du flush final.
      enregistreur.start(1000)
      setEnregistrementVocal(true)
      setDureeEnregistrement(0)
      minuteurVocalRef.current = setInterval(() => setDureeEnregistrement((d) => d + 1), 1000)
    } catch {
      setErreurMedia("Micro indisponible ou acces refuse.")
    }
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
    setFinRaison('chauffeur')
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

  const primary = operateur?.couleur_primaire || '#7A3B1E'
  const accent = operateur?.couleur_secondaire || '#E0A526'
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
            <div style={{ margin: '0 auto 24px' }}><Marque nom={operateur?.nom} logoUrl={operateur?.logo_url} grande /></div>
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
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => router.push('/')}>← Retour à l&apos;accueil</button>
          </div>
        )}

        {ecran === 'accueil' && chauffeur && (
          <>
            <div className="screen-header">
              <span className="brand"><Marque nom={operateur?.nom} logoUrl={operateur?.logo_url} /><span className="brand-label">{operateur?.nom}</span></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="muted">{chauffeur.statut === 'disponible' ? 'Disponible' : chauffeur.statut === 'en_course' ? 'En course' : 'Indisponible'}{position ? ' · 📍' : ''}</span>
                <button className={`toggle${chauffeur.statut === 'disponible' ? ' on' : ''}`} onClick={toggleDispo} disabled={chauffeur.statut === 'en_course'} />
              </div>
            </div>
            <div className="screen-body">
              <div className="map-placeholder">
                {position && <Carte points={[{ ...position, couleur: primary }]} zoom={15} />}
              </div>
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
            <div className="screen-header">
              <strong>Nouvelle course</strong>
              <span className="badge warn">{demande.type_course === 'intervilles' ? '🛣️ Intervilles' : '🏙️ Ville'}{demande.type_vehicule === 'moto' ? ' · 🏍️' : ''}</span>
            </div>
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
              <div className="map-placeholder">
                {(position || (courseActive.depart_lat != null && courseActive.depart_lng != null)) && (
                  <Carte
                    points={[
                      ...(position ? [{ ...position, couleur: primary }] : []),
                      ...(courseActive.depart_lat != null && courseActive.depart_lng != null
                        ? [{ lat: courseActive.depart_lat, lng: courseActive.depart_lng, couleur: accent }]
                        : []),
                    ]}
                    zoom={14}
                  />
                )}
              </div>
              <div className="card"><div className="muted">Départ</div><strong>{courseActive.adresse_depart}</strong></div>
              {contactPassager && (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn outline" onClick={appel.demarrerAppel} disabled={appel.etat !== 'inactif'}>
                    📞 Appeler {contactPassager.nom || 'le passager'}
                  </button>
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
              <div className="map-placeholder">
                {(position || (courseActive.arrivee_lat != null && courseActive.arrivee_lng != null)) && (
                  <Carte
                    points={[
                      ...(position ? [{ ...position, couleur: primary }] : []),
                      ...(courseActive.arrivee_lat != null && courseActive.arrivee_lng != null
                        ? [{ lat: courseActive.arrivee_lat, lng: courseActive.arrivee_lng, couleur: accent }]
                        : []),
                    ]}
                    zoom={14}
                  />
                )}
              </div>
              <div className="card"><div className="muted">Destination</div><strong>{courseActive.adresse_arrivee}</strong></div>
              {contactPassager && (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn outline" onClick={appel.demarrerAppel} disabled={appel.etat !== 'inactif'}>
                    📞 Appeler {contactPassager.nom || 'le passager'}
                  </button>
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

        {ecran === 'fin' && finRaison === 'chauffeur' && (
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

        {ecran === 'fin' && finRaison !== 'chauffeur' && (
          <>
            <div className="screen-header"><strong>{finRaison === 'passager_terminee' ? 'Course terminée' : 'Course annulée'}</strong></div>
            <div className="screen-body center">
              <p className="muted" style={{ marginTop: 16 }}>
                {finRaison === 'passager_terminee'
                  ? 'Le passager a mis fin à la course.'
                  : 'Le passager a annulé la course.'}
              </p>
              {finRaison === 'passager_terminee' && prixTermine ? <div className="price">{prixTermine} DH</div> : null}
              <p className="muted" style={{ marginTop: 16 }}>Vous êtes de nouveau disponible pour une nouvelle course.</p>
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
                  background: m.expediteur === 'chauffeur' ? 'var(--primary)' : '#F0E4D3',
                  color: m.expediteur === 'chauffeur' ? 'var(--primary-text, #fff)' : 'var(--text)',
                  borderRadius: 14, padding: '8px 12px',
                }}>
                  {m.type === 'image' && m.media_path && (
                    <img src={`${URL_BASE_MEDIA}/${m.media_path}`} alt="Photo" style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />
                  )}
                  {m.type === 'audio' && m.media_path && (
                    <audio controls src={`${URL_BASE_MEDIA}/${m.media_path}`} style={{ maxWidth: 220, display: 'block' }} />
                  )}
                  {m.type === 'texte' && <div style={{ fontSize: 14 }}>{m.contenu}</div>}
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
            <div className="screen-footer">
              {erreurMedia && <p className="error-text" style={{ marginTop: 0 }}>{erreurMedia}</p>}
              <div className="btn-row" style={{ marginBottom: 8 }}>
                <button className="btn outline" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => fichierPhotoRef.current?.click()} disabled={envoiMediaEnCours || enregistrementVocal}>
                  📷 Photo
                </button>
                <button className={`btn ${enregistrementVocal ? 'danger' : 'outline'}`} style={{ width: 'auto', padding: '8px 14px' }} onClick={toggleEnregistrementVocal} disabled={envoiMediaEnCours}>
                  {enregistrementVocal ? `⏹ ${dureeEnregistrement}s` : '🎤 Vocal'}
                </button>
                <input ref={fichierPhotoRef} type="file" accept="image/*" capture="environment" hidden onChange={choisirPhoto} />
              </div>
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
      {(appel.etat !== 'inactif' || appel.erreur) && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ textAlign: 'center', maxWidth: 300 }}>
            {appel.etat === 'sortant' && (
              <>
                <div className="pulse" />
                <h3 style={{ marginBottom: 4 }}>Appel en cours…</h3>
                <p className="muted">{contactPassager?.nom || 'Passager'}</p>
                <button className="btn outline" style={{ marginTop: 16 }} onClick={appel.raccrocher}>Annuler</button>
              </>
            )}
            {appel.etat === 'entrant' && (
              <>
                <div className="pulse" />
                <h3 style={{ marginBottom: 4 }}>Appel entrant</h3>
                <p className="muted">{appel.correspondant}</p>
                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button className="btn outline" onClick={appel.refuserAppel}>Refuser</button>
                  <button className="btn accent" onClick={appel.accepterAppel}>Répondre</button>
                </div>
              </>
            )}
            {appel.etat === 'connecte' && (
              <>
                <h3 style={{ marginBottom: 4 }}>{contactPassager?.nom || 'Passager'}</h3>
                <p className="muted">{String(Math.floor(appel.dureeSec / 60)).padStart(2, '0')}:{String(appel.dureeSec % 60).padStart(2, '0')}</p>
                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button className="btn outline" onClick={appel.toggleMic}>{appel.micCoupe ? '🔇 Micro coupé' : '🎙️ Micro actif'}</button>
                  <button className="btn danger" onClick={appel.raccrocher}>Raccrocher</button>
                </div>
              </>
            )}
            {appel.etat === 'inactif' && appel.erreur && <p className="muted">{appel.erreur}</p>}
            {appel.etat !== 'inactif' && appel.erreur && <p className="error-text" style={{ marginTop: 12 }}>{appel.erreur}</p>}
          </div>
        </div>
      )}
      <audio ref={appel.audioRef} autoPlay playsInline hidden />
    </div>
  )
}
