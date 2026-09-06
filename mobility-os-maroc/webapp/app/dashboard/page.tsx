'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOperateurId } from '@/lib/useOperateurId'

const Carte = dynamic(() => import('@/components/Carte'), { ssr: false })

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string; ville: string | null; owner_user_id: string | null }
type ChauffeurRow = { id: string; nom: string; telephone: string; vehicule: string | null; plaque: string | null; note_moyenne: number; statut: string; position_lat: number | null; position_lng: number | null; position_recente: boolean; type_vehicule: string }
type TrajetInterville = { id: string; ville_depart: string; ville_arrivee: string; prix: number; actif: boolean }
type CourseRow = { id: string; statut: string; adresse_depart: string; adresse_arrivee: string; prix_estime: number; prix_final: number | null; created_at: string; chauffeur_id: string | null; depart_lat: number | null; depart_lng: number | null; bloquee: boolean }
type CourseEvent = { id: string; type: string; chauffeur_id: string | null; acteur: string | null; details: Record<string, any> | null; created_at: string }
type Zone = { id: string; nom: string; tarif_base: number; tarif_km: number }

const LIBELLES_EVENEMENT: Record<string, string> = {
  creee: 'Course créée',
  proposee: 'Proposée à un chauffeur',
  refusee: 'Refusée par le chauffeur',
  assignee: 'Chauffeur assigné',
  en_cours: 'Course démarrée',
  terminee: 'Course terminée',
  annulee: 'Annulée',
  sans_chauffeur: 'Expirée sans chauffeur',
  notee: 'Notée',
}

function libelleEvenement(ev: CourseEvent): string {
  const base = LIBELLES_EVENEMENT[ev.type] || ev.type
  if (ev.type === 'notee' && ev.details?.note != null) return `${base} (${ev.details.note}★)`
  if (ev.type === 'creee' && ev.details?.prix_estime != null) return `${base} (estimé ${ev.details.prix_estime} DH)`
  return base
}

function acteurAffiche(acteur: string | null): { label: string; systeme: boolean } {
  if (!acteur) return { label: 'Inconnu', systeme: false }
  const [role, valeur] = acteur.split(':')
  if (role === 'systeme') return { label: 'Système (automatique)', systeme: true }
  if (role === 'chauffeur') return { label: `Chauffeur · ${valeur}`, systeme: false }
  if (role === 'passager') return { label: `Passager · ${valeur}`, systeme: false }
  if (role === 'operateur') return { label: 'Clôturée manuellement (vous)', systeme: false }
  return { label: acteur, systeme: false }
}

export default function DashboardPage() {
  const supabase = createClient()
  const { operateurId: OPERATEUR_ID, chargement: chargementOperateur, erreur: erreurResolution } = useOperateurId()
  const [chargement, setChargement] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurAuth, setErreurAuth] = useState<string | null>(null)
  const [operateur, setOperateur] = useState<Operateur | null>(null)
  const [messageOperateur, setMessageOperateur] = useState<string | null>(null)
  const router = useRouter()
  const [onglet, setOnglet] = useState<'apercu' | 'chauffeurs' | 'courses' | 'flotte' | 'tarifs' | 'parametres'>('apercu')
  const [chauffeurs, setChauffeurs] = useState<ChauffeurRow[]>([])
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauTelephone, setNouveauTelephone] = useState('')
  const [nouveauVehicule, setNouveauVehicule] = useState('')
  const [nouvellePlaque, setNouvellePlaque] = useState('')
  const [nouveauTypeVehicule, setNouveauTypeVehicule] = useState<'voiture' | 'moto'>('voiture')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [ajoutErreur, setAjoutErreur] = useState<string | null>(null)
  const [retraitEnCoursId, setRetraitEnCoursId] = useState<string | null>(null)
  const [retraitErreur, setRetraitErreur] = useState<string | null>(null)
  const [clotureEnCoursId, setClotureEnCoursId] = useState<string | null>(null)
  const [timelineCourse, setTimelineCourse] = useState<CourseRow | null>(null)
  const [timelineEvenements, setTimelineEvenements] = useState<CourseEvent[]>([])
  const [timelineChargement, setTimelineChargement] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [zonesEdit, setZonesEdit] = useState<Record<string, { tarif_base: string; tarif_km: string }>>({})
  const [zoneEnCoursId, setZoneEnCoursId] = useState<string | null>(null)
  const [zoneErreur, setZoneErreur] = useState<string | null>(null)
  const [nouvelleZoneNom, setNouvelleZoneNom] = useState('')
  const [nouvelleZoneTarifBase, setNouvelleZoneTarifBase] = useState(10)
  const [nouvelleZoneTarifKm, setNouvelleZoneTarifKm] = useState(2)
  const [ajoutZoneEnCours, setAjoutZoneEnCours] = useState(false)
  const [nomEdit, setNomEdit] = useState('')
  const [villeEdit, setVilleEdit] = useState('')
  const [couleurPrimaireEdit, setCouleurPrimaireEdit] = useState('#101B3D')
  const [couleurSecondaireEdit, setCouleurSecondaireEdit] = useState('#FF7A28')
  const [parametresEnCours, setParametresEnCours] = useState(false)
  const [parametresErreur, setParametresErreur] = useState<string | null>(null)
  const [parametresSucces, setParametresSucces] = useState(false)
  const [chauffeurEnEdition, setChauffeurEnEdition] = useState<ChauffeurRow | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editTelephone, setEditTelephone] = useState('')
  const [editVehicule, setEditVehicule] = useState('')
  const [editPlaque, setEditPlaque] = useState('')
  const [editTypeVehicule, setEditTypeVehicule] = useState<'voiture' | 'moto'>('voiture')
  const [editionEnCours, setEditionEnCours] = useState(false)
  const [editionErreur, setEditionErreur] = useState<string | null>(null)
  // Trajets intervilles (P11, demande produit) : prix fixe par trajet
  // ville_depart -> ville_arrivee, distinct des zones tarifaires "ville"
  // (celles-ci restent basees sur la distance geocodee).
  const [trajetsIntervilles, setTrajetsIntervilles] = useState<TrajetInterville[]>([])
  const [nouvelleVilleDepart, setNouvelleVilleDepart] = useState('')
  const [nouvelleVilleArrivee, setNouvelleVilleArrivee] = useState('')
  const [nouveauPrixTrajet, setNouveauPrixTrajet] = useState(100)
  const [ajoutTrajetEnCours, setAjoutTrajetEnCours] = useState(false)
  const [trajetErreur, setTrajetErreur] = useState<string | null>(null)
  const [trajetEnCoursId, setTrajetEnCoursId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChargement(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !OPERATEUR_ID) return
    resoudreOperateur()
  }, [session, OPERATEUR_ID])

  useEffect(() => {
    if (!operateur) return
    setNomEdit(operateur.nom)
    setVilleEdit(operateur.ville || '')
    setCouleurPrimaireEdit(operateur.couleur_primaire)
    setCouleurSecondaireEdit(operateur.couleur_secondaire)
  }, [operateur])

  useEffect(() => {
    if (!operateur) return
    chargerDonnees()
    const channel = supabase
      .channel('dashboard-' + operateur.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `operateur_id=eq.${operateur.id}` }, () => chargerDonnees())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chauffeurs', filter: `operateur_id=eq.${operateur.id}` }, () => chargerDonnees())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [operateur?.id])

  async function resoudreOperateur() {
    const { data } = await supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire,ville,owner_user_id').eq('id', OPERATEUR_ID).single()
    if (!data) return
    if (data.owner_user_id === session.user.id) { setOperateur(data); return }
    if (data.owner_user_id === null) {
      const { data: ok } = await supabase.rpc('reclamer_operateur', { p_operateur_id: OPERATEUR_ID })
      if (ok) {
        const { data: refetched } = await supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire,ville,owner_user_id').eq('id', OPERATEUR_ID).single()
        setOperateur(refetched)
        return
      }
    }
    setMessageOperateur("Cet opérateur est déjà géré par un autre compte.")
  }

  async function chargerDonnees() {
    if (!operateur) return
    const { data: ch } = await supabase.rpc('chauffeurs_operateur', { p_operateur_id: operateur.id })
    setChauffeurs(ch || [])
    const { data: co } = await supabase.rpc('courses_operateur', { p_operateur_id: operateur.id })
    setCourses(co || [])
    const { data: zo } = await supabase.from('zones_operateur').select('id,nom,tarif_base,tarif_km').eq('operateur_id', operateur.id).order('nom')
    setZones(zo || [])
    setZonesEdit(Object.fromEntries((zo || []).map((z) => [z.id, { tarif_base: String(z.tarif_base), tarif_km: String(z.tarif_km) }])))
    const { data: ti } = await supabase.from('trajets_intervilles').select('id,ville_depart,ville_arrivee,prix,actif').eq('operateur_id', operateur.id).order('created_at')
    setTrajetsIntervilles(ti || [])
  }

  // Aucun mecanisme ne debloquait une course restee coincee en assignee/
  // en_cours (chauffeur qui n'a jamais clique "terminer" cote app, appli
  // fermee, etc.) -- seul le chauffeur pouvait avancer sa propre course.
  // Cloture manuelle reservee au proprietaire (verifie server-side).
  async function cloturerCourse(courseId: string, nouveauStatut: 'terminee' | 'annulee') {
    setClotureEnCoursId(courseId)
    await supabase.rpc('operateur_cloturer_course', { p_course_id: courseId, p_nouveau_statut: nouveauStatut })
    setClotureEnCoursId(null)
    chargerDonnees()
  }

  // Course Timeline (Phase 2A/2B) : reconstruit le fil complet d'une course
  // (creation, propositions/refus, transitions, notation) via evenements_course(),
  // deja livree en P1 mais jamais affichee cote UI jusqu'ici.
  async function ouvrirTimeline(course: CourseRow) {
    setTimelineCourse(course)
    setTimelineChargement(true)
    const { data } = await supabase.rpc('evenements_course', { p_course_id: course.id })
    setTimelineEvenements(data || [])
    setTimelineChargement(false)
  }
  function fermerTimeline() {
    setTimelineCourse(null)
    setTimelineEvenements([])
  }

  // Gestion des zones tarifaires (Phase 2B, finition UX) : aucune interface
  // n'existait apres l'onboarding malgre des policies RLS proprietaire deja
  // en place (zones_gestion_insert/update/delete_owner) -- un operateur ne
  // pouvait ni ajouter une deuxieme zone ni corriger un tarif apres coup.
  async function enregistrerZone(zoneId: string) {
    const edit = zonesEdit[zoneId]
    if (!edit) return
    setZoneErreur(null)
    setZoneEnCoursId(zoneId)
    const { error } = await supabase.from('zones_operateur').update({
      tarif_base: parseFloat(edit.tarif_base) || 0,
      tarif_km: parseFloat(edit.tarif_km) || 0,
    }).eq('id', zoneId)
    setZoneEnCoursId(null)
    if (error) { setZoneErreur(error.message); return }
    chargerDonnees()
  }

  async function supprimerZone(zoneId: string) {
    if (zones.length <= 1) return
    if (typeof window !== 'undefined' && !window.confirm('Supprimer cette zone tarifaire ?')) return
    setZoneErreur(null)
    setZoneEnCoursId(zoneId)
    const { error } = await supabase.from('zones_operateur').delete().eq('id', zoneId)
    setZoneEnCoursId(null)
    if (error) { setZoneErreur(error.message); return }
    chargerDonnees()
  }

  async function ajouterZone() {
    if (!operateur) return
    setZoneErreur(null)
    if (!nouvelleZoneNom.trim()) { setZoneErreur('Le nom de la zone est requis.'); return }
    setAjoutZoneEnCours(true)
    const { error } = await supabase.from('zones_operateur').insert({
      operateur_id: operateur.id,
      nom: nouvelleZoneNom.trim(),
      tarif_base: nouvelleZoneTarifBase,
      tarif_km: nouvelleZoneTarifKm,
    })
    setAjoutZoneEnCours(false)
    if (error) { setZoneErreur(error.message); return }
    setNouvelleZoneNom(''); setNouvelleZoneTarifBase(10); setNouvelleZoneTarifKm(2)
    chargerDonnees()
  }

  // Trajets intervilles (P11, demande produit) : prix fixe par trajet plutot
  // que le calcul par distance des zones "ville" -- meme patron CRUD que les
  // zones tarifaires ci-dessus (policies RLS owner deja en place).
  async function ajouterTrajetInterville() {
    if (!operateur) return
    setTrajetErreur(null)
    if (!nouvelleVilleDepart.trim() || !nouvelleVilleArrivee.trim()) { setTrajetErreur('Ville de départ et ville d’arrivée sont requises.'); return }
    setAjoutTrajetEnCours(true)
    const { error } = await supabase.from('trajets_intervilles').insert({
      operateur_id: operateur.id,
      ville_depart: nouvelleVilleDepart.trim(),
      ville_arrivee: nouvelleVilleArrivee.trim(),
      prix: nouveauPrixTrajet,
    })
    setAjoutTrajetEnCours(false)
    if (error) { setTrajetErreur(error.message); return }
    setNouvelleVilleDepart(''); setNouvelleVilleArrivee(''); setNouveauPrixTrajet(100)
    chargerDonnees()
  }

  async function basculerActifTrajet(t: TrajetInterville) {
    setTrajetErreur(null)
    setTrajetEnCoursId(t.id)
    const { error } = await supabase.from('trajets_intervilles').update({ actif: !t.actif }).eq('id', t.id)
    setTrajetEnCoursId(null)
    if (error) { setTrajetErreur(error.message); return }
    chargerDonnees()
  }

  async function supprimerTrajetInterville(t: TrajetInterville) {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer le trajet ${t.ville_depart} → ${t.ville_arrivee} ?`)) return
    setTrajetErreur(null)
    setTrajetEnCoursId(t.id)
    const { error } = await supabase.from('trajets_intervilles').delete().eq('id', t.id)
    setTrajetEnCoursId(null)
    if (error) { setTrajetErreur(error.message); return }
    chargerDonnees()
  }

  // Retirer un chauffeur (Phase 2B, finition UX) : seul l'ajout existait --
  // aucun moyen de retirer un chauffeur qui ne travaille plus pour
  // l'operateur, malgre la policy RLS chauffeurs_suppression_owner deja
  // en place. Bloque volontairement si le chauffeur est en course. Un
  // chauffeur ayant deja une course a son actif ne peut pas etre supprime
  // (contrainte de cle etrangere courses.chauffeur_id, decouverte en testant
  // cette fonctionnalite avant deploiement) -- message clair plutot que
  // l'erreur Postgres brute.
  async function retirerChauffeur(c: ChauffeurRow) {
    if (c.statut === 'en_course') return
    if (typeof window !== 'undefined' && !window.confirm(`Retirer ${c.nom} de la flotte ?`)) return
    setRetraitErreur(null)
    setRetraitEnCoursId(c.id)
    const { error } = await supabase.from('chauffeurs').delete().eq('id', c.id)
    setRetraitEnCoursId(null)
    if (error) {
      if (error.code === '23503') {
        setRetraitErreur(`${c.nom} a un historique de courses et ne peut pas être supprimé. Utilisez plutôt le bouton "Désactiver" pour le retirer du dispatch sans perdre son historique.`)
      } else {
        setRetraitErreur(error.message)
      }
      return
    }
    chargerDonnees()
  }

  // Desactiver/reactiver un chauffeur depuis le dashboard (Phase 2B, finition
  // UX) : "Retirer" (suppression) echoue par construction (FK courses.chauffeur_id)
  // des qu'un chauffeur a deja roule -- ce qui est le cas de la quasi-totalite
  // d'une flotte reelle. Le seul recours propose jusqu'ici (demander au
  // chauffeur de se mettre "indisponible" depuis son propre acces) ne marche
  // pas quand l'operateur veut le deconnecter lui-meme (chauffeur injoignable,
  // parti, telephone perdu). Force directement chauffeurs.statut ; autorise par
  // la policy RLS chauffeurs_maj_owner (deja en place, aucune migration requise).
  async function basculerDisponibiliteChauffeur(c: ChauffeurRow) {
    if (c.statut === 'en_course') return
    const nouveauStatut = c.statut === 'indisponible' ? 'disponible' : 'indisponible'
    setRetraitErreur(null)
    setRetraitEnCoursId(c.id)
    const { error } = await supabase.from('chauffeurs').update({ statut: nouveauStatut }).eq('id', c.id)
    setRetraitEnCoursId(null)
    if (error) { setRetraitErreur(error.message); return }
    chargerDonnees()
  }

  async function ajouterChauffeur() {
    if (!operateur) return
    setAjoutErreur(null)
    if (!nouveauNom.trim() || !nouveauTelephone.trim()) { setAjoutErreur('Nom et téléphone sont requis.'); return }
    setAjoutEnCours(true)
    const { error } = await supabase.from('chauffeurs').insert({
      operateur_id: operateur.id,
      nom: nouveauNom.trim(),
      telephone: nouveauTelephone.trim(),
      vehicule: nouveauVehicule.trim() || null,
      plaque: nouvellePlaque.trim() || null,
      statut: 'disponible',
      type_vehicule: nouveauTypeVehicule,
    })
    setAjoutEnCours(false)
    if (error) {
      if (error.code === '23505') {
        setAjoutErreur('Ce numéro de téléphone est déjà utilisé par un autre chauffeur de votre flotte.')
      } else {
        setAjoutErreur(error.message)
      }
      return
    }
    setNouveauNom(''); setNouveauTelephone(''); setNouveauVehicule(''); setNouvellePlaque(''); setNouveauTypeVehicule('voiture')
    chargerDonnees()
  }

  // Modifier un chauffeur existant (Phase 2B, finition UX) : seuls l'ajout et
  // le retrait/desactivation existaient -- aucun moyen de corriger une faute
  // de frappe sur un nom/telephone ou de mettre a jour un vehicule/une plaque
  // sans supprimer puis recreer le chauffeur (perdant alors son historique de
  // courses, cf. contrainte FK courses.chauffeur_id).
  function ouvrirEditionChauffeur(c: ChauffeurRow) {
    setChauffeurEnEdition(c)
    setEditNom(c.nom)
    setEditTelephone(c.telephone)
    setEditVehicule(c.vehicule || '')
    setEditPlaque(c.plaque || '')
    setEditTypeVehicule(c.type_vehicule === 'moto' ? 'moto' : 'voiture')
    setEditionErreur(null)
  }
  function fermerEditionChauffeur() {
    setChauffeurEnEdition(null)
  }
  async function enregistrerEditionChauffeur() {
    if (!chauffeurEnEdition) return
    setEditionErreur(null)
    if (!editNom.trim() || !editTelephone.trim()) { setEditionErreur('Nom et téléphone sont requis.'); return }
    setEditionEnCours(true)
    const { error } = await supabase.from('chauffeurs').update({
      nom: editNom.trim(),
      telephone: editTelephone.trim(),
      vehicule: editVehicule.trim() || null,
      plaque: editPlaque.trim() || null,
      type_vehicule: editTypeVehicule,
    }).eq('id', chauffeurEnEdition.id)
    setEditionEnCours(false)
    if (error) {
      if (error.code === '23505') {
        setEditionErreur('Ce numéro de téléphone est déjà utilisé par un autre chauffeur de votre flotte.')
      } else {
        setEditionErreur(error.message)
      }
      return
    }
    setChauffeurEnEdition(null)
    chargerDonnees()
  }

  // Parametres operateur (Phase 2B, finition UX) : le nom/ville/couleurs ne
  // sont saisis qu'une fois, a l'onboarding (creer_mon_operateur) -- aucune
  // interface ne permettait de les corriger ensuite, alors que la policy RLS
  // operateurs_maj_owner existe deja pour ca. On ne touche volontairement
  // qu'a nom/ville/couleurs ici : le slug (URLs deja partagees/imprimees) et
  // le statut actif (reserve a l'admin plateforme) restent hors de portee de
  // cette interface, meme si la colonne est techniquement modifiable par le
  // proprietaire cote base -- une future revue RLS pourrait resserrer ca.
  async function enregistrerParametres() {
    if (!operateur) return
    setParametresErreur(null)
    setParametresSucces(false)
    if (!nomEdit.trim()) { setParametresErreur("Le nom de l'opérateur est requis."); return }
    setParametresEnCours(true)
    const { error } = await supabase.from('operateurs').update({
      nom: nomEdit.trim(),
      ville: villeEdit.trim() || null,
      couleur_primaire: couleurPrimaireEdit,
      couleur_secondaire: couleurSecondaireEdit,
    }).eq('id', operateur.id)
    setParametresEnCours(false)
    if (error) { setParametresErreur(error.message); return }
    setOperateur({ ...operateur, nom: nomEdit.trim(), ville: villeEdit.trim() || null, couleur_primaire: couleurPrimaireEdit, couleur_secondaire: couleurSecondaireEdit })
    setParametresSucces(true)
  }

  async function seConnecter() {
    setErreurAuth(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
    if (error) setErreurAuth(error.message)
  }
  async function sInscrire() {
    setErreurAuth(null)
    const { error } = await supabase.auth.signUp({ email, password: motDePasse })
    if (error) setErreurAuth(error.message)
    else setErreurAuth("Compte créé. Vérifiez votre email si la confirmation est activée, sinon reconnectez-vous.")
  }

  if (chargement || chargementOperateur) return null
  if (erreurResolution || !OPERATEUR_ID) {
    return <div className="auth-shell"><div className="auth-card"><p>{erreurResolution || "Ce lien ne correspond à aucun opérateur actif."}</p></div></div>
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h2>Dashboard Opérateur</h2>
          <p className="muted">{mode === 'connexion' ? 'Connectez-vous à votre espace.' : 'Créez votre compte opérateur.'}</p>
          <label className="field-label">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="field-label">Mot de passe</label>
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          {erreurAuth && <p className="error-text">{erreurAuth}</p>}
          <button className="btn" onClick={mode === 'connexion' ? seConnecter : sInscrire}>
            {mode === 'connexion' ? 'Se connecter' : "S'inscrire"}
          </button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}>
            {mode === 'connexion' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
          </button>
        </div>
      </div>
    )
  }

  if (messageOperateur) {
    return <div className="auth-shell"><div className="auth-card"><p>{messageOperateur}</p></div></div>
  }

  if (!operateur) return null

  const aujourdHui = new Date().toDateString()
  const coursesAujourdhui = courses.filter((c) => new Date(c.created_at).toDateString() === aujourdHui)
  const caJour = coursesAujourdhui.filter((c) => c.statut === 'terminee').reduce((acc, c) => acc + Number(c.prix_final || 0), 0)
  const chauffeursActifs = chauffeurs.filter((c) => c.statut !== 'indisponible').length
  const coursesEnCours = courses.filter((c) => ['en_recherche', 'assignee', 'en_cours'].includes(c.statut))

  // Control center (Phase 2B chantier 4) : les etats vivants (en_recherche/
  // assignee/en_cours/bloquee) portent sur TOUTES les courses, jamais filtres
  // par jour (une course encore active depuis hier reste une course active) ;
  // les issues finales (terminee/annulee/sans_chauffeur) sont scopees a
  // aujourd'hui, comme les KPI deja existants juste au-dessus.
  const nbEnRecherche = courses.filter((c) => c.statut === 'en_recherche').length
  const nbAssignees = courses.filter((c) => c.statut === 'assignee').length
  const nbEnCoursStatut = courses.filter((c) => c.statut === 'en_cours').length
  const nbBloquees = courses.filter((c) => c.bloquee).length
  const nbTermineesJour = coursesAujourdhui.filter((c) => c.statut === 'terminee').length
  const nbAnnuleesJour = coursesAujourdhui.filter((c) => c.statut === 'annulee').length
  const nbSansChauffeurJour = coursesAujourdhui.filter((c) => c.statut === 'sans_chauffeur').length

  const nbDisponibles = chauffeurs.filter((c) => c.statut === 'disponible').length
  const nbEnCourseChauffeurs = chauffeurs.filter((c) => c.statut === 'en_course').length
  const nbIndisponibles = chauffeurs.filter((c) => c.statut === 'indisponible').length
  const nbPositionAJour = chauffeurs.filter((c) => c.position_recente).length
  const nbPositionObsolete = chauffeurs.filter((c) => c.position_lat != null && !c.position_recente).length

  function nomChauffeur(id: string | null): string {
    if (!id) return '—'
    const c = chauffeurs.find((ch) => ch.id === id)
    return c ? c.nom : '—'
  }

  const primary = operateur.couleur_primaire
  const accent = operateur.couleur_secondaire
  const chauffeursAvecPosition = chauffeurs.filter((c) => c.position_lat != null && c.position_lng != null && c.statut !== 'indisponible')
  // Dispatch/GPS : une position vieille de plus de 2 min (position_recente = false,
  // calcule server-side dans chauffeurs_operateur()) signale un chauffeur "disponible"
  // en base mais probablement injoignable (app fermee, telephone eteint) — affiche en
  // gris plutot que dans la couleur de statut, pour ne pas le confondre avec un
  // chauffeur reellement actif.
  const pointsFlotte = [
    ...chauffeursAvecPosition.map((c) => ({ lat: c.position_lat!, lng: c.position_lng!, couleur: !c.position_recente ? '#9CA3AF' : c.statut === 'disponible' ? '#1E8E5A' : accent })),
    ...coursesEnCours.filter((c) => c.depart_lat != null && c.depart_lng != null).map((c) => ({ lat: c.depart_lat!, lng: c.depart_lng!, couleur: primary })),
  ]

  return (
    <div className="dashboard" style={{ ['--primary' as any]: primary }}>
      <div className="sidebar">
        <div className="brand"><span className="brand-mark">{operateur.nom[0]}</span><span className="brand-label">{operateur.nom}</span></div>
        <button className="nav-item" style={{ marginTop: 12 }} onClick={() => router.push('/')}>← Retour à l&apos;accueil</button>
        <nav style={{ marginTop: 28 }}>
          <button className={`nav-item${onglet === 'apercu' ? ' active' : ''}`} onClick={() => setOnglet('apercu')}>Vue d&apos;ensemble</button>
          <button className={`nav-item${onglet === 'flotte' ? ' active' : ''}`} onClick={() => setOnglet('flotte')}>Carte de flotte</button>
          <button className={`nav-item${onglet === 'chauffeurs' ? ' active' : ''}`} onClick={() => setOnglet('chauffeurs')}>Chauffeurs</button>
          <button className={`nav-item${onglet === 'courses' ? ' active' : ''}`} onClick={() => setOnglet('courses')}>Courses</button>
          <button className={`nav-item${onglet === 'tarifs' ? ' active' : ''}`} onClick={() => setOnglet('tarifs')}>Tarifs</button>
          <button className={`nav-item${onglet === 'parametres' ? ' active' : ''}`} onClick={() => setOnglet('parametres')}>Paramètres</button>
        </nav>
        <button className="nav-item" style={{ marginTop: 40, color: 'rgba(255,255,255,0.5)' }} onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
      <div className="main">
        {onglet === 'apercu' && (
          <>
            <h1>Vue d&apos;ensemble</h1>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="muted">Courses aujourd&apos;hui</div><div className="value">{coursesAujourdhui.length}</div></div>
              <div className="kpi-card"><div className="muted">Chiffre d&apos;affaires (jour)</div><div className="value">{caJour} DH</div></div>
              <div className="kpi-card"><div className="muted">Chauffeurs actifs</div><div className="value">{chauffeursActifs} / {chauffeurs.length}</div></div>
            </div>

            <h3>État des courses</h3>
            <div className="stat-row">
              <span className="badge off">En recherche · {nbEnRecherche}</span>
              <span className="badge warn">Assignées · {nbAssignees}</span>
              <span className="badge warn">En cours · {nbEnCoursStatut}</span>
              <span className="badge danger">Bloquées · {nbBloquees}</span>
              <span className="badge ok">Terminées (jour) · {nbTermineesJour}</span>
              <span className="badge off">Annulées (jour) · {nbAnnuleesJour}</span>
              <span className="badge danger">Sans chauffeur (jour) · {nbSansChauffeurJour}</span>
            </div>

            <h3>Disponibilité des chauffeurs</h3>
            <div className="stat-row">
              <span className="badge ok">Disponibles · {nbDisponibles}</span>
              <span className="badge warn">En course · {nbEnCourseChauffeurs}</span>
              <span className="badge off">Indisponibles · {nbIndisponibles}</span>
              <span className="badge ok">Position à jour · {nbPositionAJour}</span>
              <span className="badge warn">Position obsolète · {nbPositionObsolete}</span>
            </div>

            <h3>Courses en cours</h3>
            <table>
              <tbody>
                <tr><th>Trajet</th><th>Chauffeur</th><th>Statut</th><th>Prix</th><th></th></tr>
                {coursesEnCours.length === 0 && <tr><td colSpan={5} className="muted">Aucune course en cours.</td></tr>}
                {coursesEnCours.map((c) => (
                  <tr key={c.id}>
                    <td>{c.adresse_depart} → {c.adresse_arrivee} {c.bloquee && <span className="badge danger" title="Assignée depuis plus de 20 min sans progression">⚠️ bloquée</span>}</td>
                    <td>{nomChauffeur(c.chauffeur_id)}</td>
                    <td><span className={`badge ${c.statut === 'en_recherche' ? 'off' : 'warn'}`}>{c.statut}</span></td>
                    <td>{c.prix_estime} DH</td>
                    <td>
                      <button className="btn outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} disabled={clotureEnCoursId === c.id} onClick={() => cloturerCourse(c.id, 'terminee')}>
                        {clotureEnCoursId === c.id ? '…' : 'Clôturer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {onglet === 'flotte' && (
          <>
            <h1>Carte de flotte</h1>
            {pointsFlotte.length === 0 ? (
              <p className="muted">Aucune position connue pour l&apos;instant — les chauffeurs doivent être connectés à l&apos;app et avoir accepté la géolocalisation.</p>
            ) : (
              <div className="map-placeholder" style={{ height: 480 }}>
                <Carte points={pointsFlotte} zoom={12} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="muted"><span style={{ color: '#1E8E5A' }}>●</span> Chauffeur disponible ({chauffeursAvecPosition.filter((c) => c.statut === 'disponible' && c.position_recente).length})</span>
              <span className="muted"><span style={{ color: accent }}>●</span> Chauffeur en course ({chauffeursAvecPosition.filter((c) => c.statut === 'en_course' && c.position_recente).length})</span>
              <span className="muted"><span style={{ color: '#9CA3AF' }}>●</span> Position ancienne, +2min ({chauffeursAvecPosition.filter((c) => !c.position_recente).length})</span>
              <span className="muted"><span style={{ color: primary }}>●</span> Départ course en attente ({coursesEnCours.filter((c) => c.depart_lat != null).length})</span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {chauffeurs.length - chauffeursAvecPosition.length > 0 && `${chauffeurs.length - chauffeursAvecPosition.length} chauffeur(s) non affiché(s) (indisponible ou sans position GPS active).`}
            </p>
          </>
        )}

        {onglet === 'chauffeurs' && (
          <>
            <h1>Chauffeurs</h1>
            {retraitErreur && <p className="error-text">{retraitErreur}</p>}
            <table>
              <tbody>
                <tr><th>Nom</th><th>Téléphone</th><th>Type</th><th>Véhicule</th><th>Note</th><th>Statut</th><th>Position</th><th></th></tr>
                {chauffeurs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nom}</td>
                    <td>{c.telephone}</td>
                    <td><span className={`badge ${c.type_vehicule === 'moto' ? 'warn' : 'off'}`}>{c.type_vehicule === 'moto' ? '🏍️ Moto' : '🚗 Voiture'}</span></td>
                    <td>{c.vehicule} {c.plaque && `· ${c.plaque}`}</td>
                    <td>{c.note_moyenne}</td>
                    <td><span className={`badge ${c.statut === 'disponible' ? 'ok' : c.statut === 'en_course' ? 'warn' : 'off'}`}>{c.statut}</span></td>
                    <td>
                      {c.position_lat == null ? (
                        <span className="muted">inconnue</span>
                      ) : c.position_recente ? (
                        <span className="badge ok">à jour</span>
                      ) : (
                        <span className="badge warn">ancienne</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn outline"
                          style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                          onClick={() => ouvrirEditionChauffeur(c)}
                        >
                          Modifier
                        </button>
                        <button
                          className="btn outline"
                          style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                          disabled={c.statut === 'en_course' || retraitEnCoursId === c.id}
                          title={c.statut === 'en_course' ? 'Impossible de changer la disponibilité d’un chauffeur en course' : undefined}
                          onClick={() => basculerDisponibiliteChauffeur(c)}
                        >
                          {retraitEnCoursId === c.id ? '…' : c.statut === 'indisponible' ? 'Réactiver' : 'Désactiver'}
                        </button>
                        <button
                          className="btn outline"
                          style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                          disabled={c.statut === 'en_course' || retraitEnCoursId === c.id}
                          title={c.statut === 'en_course' ? 'Impossible de retirer un chauffeur en course' : undefined}
                          onClick={() => retirerChauffeur(c)}
                        >
                          {retraitEnCoursId === c.id ? '…' : 'Retirer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 32 }}>Ajouter un chauffeur</h3>
            <div className="card" style={{ padding: 20, maxWidth: 420 }}>
              <label className="field-label">Nom</label>
              <input type="text" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} />
              <label className="field-label">Téléphone</label>
              <input type="tel" value={nouveauTelephone} onChange={(e) => setNouveauTelephone(e.target.value)} placeholder="06..." />
              <label className="field-label">Type de véhicule</label>
              <select value={nouveauTypeVehicule} onChange={(e) => setNouveauTypeVehicule(e.target.value as 'voiture' | 'moto')} style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1px solid #D9C9B5', fontSize: 15, marginBottom: 12, fontFamily: 'inherit' }}>
                <option value="voiture">🚗 Voiture</option>
                <option value="moto">🏍️ Moto</option>
              </select>
              <label className="field-label">Véhicule</label>
              <input type="text" value={nouveauVehicule} onChange={(e) => setNouveauVehicule(e.target.value)} placeholder="Ex : Dacia Logan" />
              <label className="field-label">Plaque</label>
              <input type="text" value={nouvellePlaque} onChange={(e) => setNouvellePlaque(e.target.value)} />
              {ajoutErreur && <p className="error-text">{ajoutErreur}</p>}
              <button className="btn accent" onClick={ajouterChauffeur} disabled={ajoutEnCours} style={{ marginTop: 12 }}>
                {ajoutEnCours ? 'Ajout…' : 'Ajouter le chauffeur'}
              </button>
            </div>
          </>
        )}

        {onglet === 'courses' && (
          <>
            <h1>Courses</h1>
            <table>
              <tbody>
                <tr><th>Date</th><th>Trajet</th><th>Chauffeur</th><th>Statut</th><th>Prix</th><th></th></tr>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                    <td>{c.adresse_depart} → {c.adresse_arrivee} {c.bloquee && <span className="badge danger" title="Assignée depuis plus de 20 min sans progression">⚠️ bloquée</span>}</td>
                    <td>{nomChauffeur(c.chauffeur_id)}</td>
                    <td><span className={`badge ${c.statut === 'terminee' ? 'ok' : c.statut === 'annulee' || c.statut === 'sans_chauffeur' ? 'danger' : 'warn'}`}>{c.statut}</span></td>
                    <td>{c.prix_final ?? c.prix_estime} DH</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} onClick={() => ouvrirTimeline(c)}>
                          🕐 Historique
                        </button>
                        {['en_recherche', 'assignee', 'en_cours'].includes(c.statut) && (
                          <>
                            <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} disabled={clotureEnCoursId === c.id} onClick={() => cloturerCourse(c.id, 'terminee')}>
                              Terminer
                            </button>
                            <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} disabled={clotureEnCoursId === c.id} onClick={() => cloturerCourse(c.id, 'annulee')}>
                              Annuler
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {onglet === 'tarifs' && (
          <>
            <h1>Tarifs</h1>
            {zoneErreur && <p className="error-text">{zoneErreur}</p>}
            <table>
              <tbody>
                <tr><th>Zone</th><th>Prix de base (DH)</th><th>Prix / km (DH)</th><th></th></tr>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.nom}</td>
                    <td>
                      <input
                        type="number" min="0" step="0.5" style={{ width: 100, marginBottom: 0 }}
                        value={zonesEdit[z.id]?.tarif_base ?? ''}
                        onChange={(e) => setZonesEdit({ ...zonesEdit, [z.id]: { ...zonesEdit[z.id], tarif_base: e.target.value } })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.1" style={{ width: 100, marginBottom: 0 }}
                        value={zonesEdit[z.id]?.tarif_km ?? ''}
                        onChange={(e) => setZonesEdit({ ...zonesEdit, [z.id]: { ...zonesEdit[z.id], tarif_km: e.target.value } })}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} disabled={zoneEnCoursId === z.id} onClick={() => enregistrerZone(z.id)}>
                          {zoneEnCoursId === z.id ? '…' : 'Enregistrer'}
                        </button>
                        <button
                          className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                          disabled={zones.length <= 1 || zoneEnCoursId === z.id}
                          title={zones.length <= 1 ? 'Impossible de supprimer la dernière zone' : undefined}
                          onClick={() => supprimerZone(z.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 32 }}>Ajouter une zone tarifaire</h3>
            <div className="card" style={{ padding: 20, maxWidth: 420 }}>
              <label className="field-label">Nom de la zone</label>
              <input type="text" value={nouvelleZoneNom} onChange={(e) => setNouvelleZoneNom(e.target.value)} placeholder="Ex : Aéroport" />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Prix de base (DH)</label>
                  <input type="number" min="0" step="0.5" value={nouvelleZoneTarifBase} onChange={(e) => setNouvelleZoneTarifBase(parseFloat(e.target.value) || 0)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Prix / km (DH)</label>
                  <input type="number" min="0" step="0.1" value={nouvelleZoneTarifKm} onChange={(e) => setNouvelleZoneTarifKm(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <button className="btn accent" onClick={ajouterZone} disabled={ajoutZoneEnCours} style={{ marginTop: 12 }}>
                {ajoutZoneEnCours ? 'Ajout…' : 'Ajouter la zone'}
              </button>
            </div>

            <h3 style={{ marginTop: 40 }}>Trajets intervilles</h3>
            <p className="muted" style={{ marginTop: -8 }}>Prix fixe par trajet, distinct des zones tarifaires ci-dessus (basées sur la distance en ville).</p>
            {trajetErreur && <p className="error-text">{trajetErreur}</p>}
            <table>
              <tbody>
                <tr><th>Départ</th><th>Arrivée</th><th>Prix (DH)</th><th>Statut</th><th></th></tr>
                {trajetsIntervilles.length === 0 && <tr><td colSpan={5} className="muted">Aucun trajet intervilles.</td></tr>}
                {trajetsIntervilles.map((t) => (
                  <tr key={t.id}>
                    <td>{t.ville_depart}</td>
                    <td>{t.ville_arrivee}</td>
                    <td>{t.prix} DH</td>
                    <td><span className={`badge ${t.actif ? 'ok' : 'off'}`}>{t.actif ? 'actif' : 'suspendu'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} disabled={trajetEnCoursId === t.id} onClick={() => basculerActifTrajet(t)}>
                          {trajetEnCoursId === t.id ? '…' : t.actif ? 'Suspendre' : 'Réactiver'}
                        </button>
                        <button className="btn outline" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} disabled={trajetEnCoursId === t.id} onClick={() => supprimerTrajetInterville(t)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 32 }}>Ajouter un trajet intervilles</h3>
            <div className="card" style={{ padding: 20, maxWidth: 420 }}>
              <label className="field-label">Ville de départ</label>
              <input type="text" value={nouvelleVilleDepart} onChange={(e) => setNouvelleVilleDepart(e.target.value)} placeholder="Ex : Casablanca" />
              <label className="field-label">Ville d’arrivée</label>
              <input type="text" value={nouvelleVilleArrivee} onChange={(e) => setNouvelleVilleArrivee(e.target.value)} placeholder="Ex : Marrakech" />
              <label className="field-label">Prix fixe (DH)</label>
              <input type="number" min="0" step="10" value={nouveauPrixTrajet} onChange={(e) => setNouveauPrixTrajet(parseFloat(e.target.value) || 0)} />
              <button className="btn accent" onClick={ajouterTrajetInterville} disabled={ajoutTrajetEnCours} style={{ marginTop: 12 }}>
                {ajoutTrajetEnCours ? 'Ajout…' : 'Ajouter le trajet'}
              </button>
            </div>
          </>
        )}

        {onglet === 'parametres' && (
          <>
            <h1>Paramètres</h1>
            <div className="card" style={{ padding: 20, maxWidth: 420 }}>
              <label className="field-label">Nom de l&apos;opérateur</label>
              <input type="text" value={nomEdit} onChange={(e) => setNomEdit(e.target.value)} />
              <label className="field-label">Ville</label>
              <input type="text" value={villeEdit} onChange={(e) => setVilleEdit(e.target.value)} placeholder="Ex : Casablanca" />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Couleur principale</label>
                  <input type="color" value={couleurPrimaireEdit} onChange={(e) => setCouleurPrimaireEdit(e.target.value)} style={{ width: '100%', height: 44, padding: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Couleur secondaire</label>
                  <input type="color" value={couleurSecondaireEdit} onChange={(e) => setCouleurSecondaireEdit(e.target.value)} style={{ width: '100%', height: 44, padding: 4 }} />
                </div>
              </div>
              {parametresErreur && <p className="error-text">{parametresErreur}</p>}
              {parametresSucces && <p className="muted" style={{ color: 'var(--success)' }}>Paramètres enregistrés.</p>}
              <button className="btn accent" onClick={enregistrerParametres} disabled={parametresEnCours} style={{ marginTop: 12 }}>
                {parametresEnCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>

      {chauffeurEnEdition && (
        <div className="modal-overlay" onClick={fermerEditionChauffeur}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={fermerEditionChauffeur} aria-label="Fermer">×</button>
            <h3>Modifier le chauffeur</h3>
            <label className="field-label">Nom</label>
            <input type="text" value={editNom} onChange={(e) => setEditNom(e.target.value)} />
            <label className="field-label">Téléphone</label>
            <input type="tel" value={editTelephone} onChange={(e) => setEditTelephone(e.target.value)} />
            <label className="field-label">Type de véhicule</label>
            <select value={editTypeVehicule} onChange={(e) => setEditTypeVehicule(e.target.value as 'voiture' | 'moto')} style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1px solid #D9C9B5', fontSize: 15, marginBottom: 12, fontFamily: 'inherit' }}>
              <option value="voiture">🚗 Voiture</option>
              <option value="moto">🏍️ Moto</option>
            </select>
            <label className="field-label">Véhicule</label>
            <input type="text" value={editVehicule} onChange={(e) => setEditVehicule(e.target.value)} placeholder="Ex : Dacia Logan" />
            <label className="field-label">Plaque</label>
            <input type="text" value={editPlaque} onChange={(e) => setEditPlaque(e.target.value)} />
            {editionErreur && <p className="error-text">{editionErreur}</p>}
            <button className="btn accent" onClick={enregistrerEditionChauffeur} disabled={editionEnCours} style={{ marginTop: 12 }}>
              {editionEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {timelineCourse && (
        <div className="modal-overlay" onClick={fermerTimeline}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={fermerTimeline} aria-label="Fermer">×</button>
            <h3>Historique de la course</h3>
            <p className="muted">{timelineCourse.adresse_depart} → {timelineCourse.adresse_arrivee}</p>
            {timelineChargement && <p className="muted">Chargement…</p>}
            {!timelineChargement && timelineEvenements.length === 0 && (
              <p className="muted">Aucun événement enregistré pour cette course.</p>
            )}
            {!timelineChargement && timelineEvenements.length > 0 && (
              <ul className="timeline">
                {timelineEvenements.map((ev) => {
                  const acteur = acteurAffiche(ev.acteur)
                  return (
                    <li key={ev.id} className={`timeline-item${acteur.systeme ? ' systeme' : ''}`}>
                      <div className="timeline-time">{new Date(ev.created_at).toLocaleString('fr-FR')}</div>
                      <div className="timeline-label">{libelleEvenement(ev)}</div>
                      <div className="timeline-acteur">{acteur.label}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
