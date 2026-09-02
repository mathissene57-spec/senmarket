'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useOperateurId } from '@/lib/useOperateurId'

const Carte = dynamic(() => import('@/components/Carte'), { ssr: false })

type Operateur = { id: string; nom: string; couleur_primaire: string; couleur_secondaire: string; owner_user_id: string | null }
type ChauffeurRow = { id: string; nom: string; telephone: string; vehicule: string | null; plaque: string | null; note_moyenne: number; statut: string; position_lat: number | null; position_lng: number | null }
type CourseRow = { id: string; statut: string; adresse_depart: string; adresse_arrivee: string; prix_estime: number; prix_final: number | null; created_at: string; chauffeur_id: string | null; depart_lat: number | null; depart_lng: number | null }

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
  const [onglet, setOnglet] = useState<'apercu' | 'chauffeurs' | 'courses' | 'flotte'>('apercu')
  const [chauffeurs, setChauffeurs] = useState<ChauffeurRow[]>([])
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauTelephone, setNouveauTelephone] = useState('')
  const [nouveauVehicule, setNouveauVehicule] = useState('')
  const [nouvellePlaque, setNouvellePlaque] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [ajoutErreur, setAjoutErreur] = useState<string | null>(null)

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
    chargerDonnees()
    const channel = supabase
      .channel('dashboard-' + operateur.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `operateur_id=eq.${operateur.id}` }, () => chargerDonnees())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chauffeurs', filter: `operateur_id=eq.${operateur.id}` }, () => chargerDonnees())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [operateur?.id])

  async function resoudreOperateur() {
    const { data } = await supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire,owner_user_id').eq('id', OPERATEUR_ID).single()
    if (!data) return
    if (data.owner_user_id === session.user.id) { setOperateur(data); return }
    if (data.owner_user_id === null) {
      const { data: ok } = await supabase.rpc('reclamer_operateur', { p_operateur_id: OPERATEUR_ID })
      if (ok) {
        const { data: refetched } = await supabase.from('operateurs').select('id,nom,couleur_primaire,couleur_secondaire,owner_user_id').eq('id', OPERATEUR_ID).single()
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
    })
    setAjoutEnCours(false)
    if (error) { setAjoutErreur(error.message); return }
    setNouveauNom(''); setNouveauTelephone(''); setNouveauVehicule(''); setNouvellePlaque('')
    chargerDonnees()
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

  const primary = operateur.couleur_primaire
  const accent = operateur.couleur_secondaire
  const chauffeursAvecPosition = chauffeurs.filter((c) => c.position_lat != null && c.position_lng != null && c.statut !== 'indisponible')
  const pointsFlotte = [
    ...chauffeursAvecPosition.map((c) => ({ lat: c.position_lat!, lng: c.position_lng!, couleur: c.statut === 'disponible' ? '#1E8E5A' : accent })),
    ...coursesEnCours.filter((c) => c.depart_lat != null && c.depart_lng != null).map((c) => ({ lat: c.depart_lat!, lng: c.depart_lng!, couleur: primary })),
  ]

  return (
    <div className="dashboard" style={{ ['--primary' as any]: primary }}>
      <div className="sidebar">
        <div className="brand"><span className="brand-mark">{operateur.nom[0]}</span><span className="brand-label">{operateur.nom}</span></div>
        <nav style={{ marginTop: 28 }}>
          <button className={`nav-item${onglet === 'apercu' ? ' active' : ''}`} onClick={() => setOnglet('apercu')}>Vue d&apos;ensemble</button>
          <button className={`nav-item${onglet === 'flotte' ? ' active' : ''}`} onClick={() => setOnglet('flotte')}>Carte de flotte</button>
          <button className={`nav-item${onglet === 'chauffeurs' ? ' active' : ''}`} onClick={() => setOnglet('chauffeurs')}>Chauffeurs</button>
          <button className={`nav-item${onglet === 'courses' ? ' active' : ''}`} onClick={() => setOnglet('courses')}>Courses</button>
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
            <h3>Courses en cours</h3>
            <table>
              <tbody>
                <tr><th>Trajet</th><th>Statut</th><th>Prix</th></tr>
                {coursesEnCours.length === 0 && <tr><td colSpan={3} className="muted">Aucune course en cours.</td></tr>}
                {coursesEnCours.map((c) => (
                  <tr key={c.id}>
                    <td>{c.adresse_depart} → {c.adresse_arrivee}</td>
                    <td><span className={`badge ${c.statut === 'en_recherche' ? 'off' : 'warn'}`}>{c.statut}</span></td>
                    <td>{c.prix_estime} DH</td>
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
            <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
              <span className="muted"><span style={{ color: '#1E8E5A' }}>●</span> Chauffeur disponible ({chauffeursAvecPosition.filter((c) => c.statut === 'disponible').length})</span>
              <span className="muted"><span style={{ color: accent }}>●</span> Chauffeur en course ({chauffeursAvecPosition.filter((c) => c.statut === 'en_course').length})</span>
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
            <table>
              <tbody>
                <tr><th>Nom</th><th>Téléphone</th><th>Véhicule</th><th>Note</th><th>Statut</th></tr>
                {chauffeurs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nom}</td>
                    <td>{c.telephone}</td>
                    <td>{c.vehicule} {c.plaque && `· ${c.plaque}`}</td>
                    <td>{c.note_moyenne}</td>
                    <td><span className={`badge ${c.statut === 'disponible' ? 'ok' : c.statut === 'en_course' ? 'warn' : 'off'}`}>{c.statut}</span></td>
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
                <tr><th>Date</th><th>Trajet</th><th>Statut</th><th>Prix</th></tr>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                    <td>{c.adresse_depart} → {c.adresse_arrivee}</td>
                    <td><span className={`badge ${c.statut === 'terminee' ? 'ok' : c.statut === 'annulee' || c.statut === 'sans_chauffeur' ? 'danger' : 'warn'}`}>{c.statut}</span></td>
                    <td>{c.prix_final ?? c.prix_estime} DH</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
