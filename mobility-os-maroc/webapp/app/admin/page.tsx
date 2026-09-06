'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// P2.5 : panneau admin plateforme, distinct du dashboard par-operateur.
// Reserve aux comptes presents dans la table admin_plateforme (verifie
// server-side dans chaque RPC, jamais cote client) — ce n'est pas une
// route tenant-scopee, elle n'utilise donc pas useOperateurId().
type OperateurAdmin = {
  id: string
  nom: string
  slug: string
  ville: string | null
  actif: boolean
  couleur_primaire: string
  created_at: string
  nb_chauffeurs: number
  nb_courses: number
  nb_courses_terminees: number
  ca_total: number
  devise: string
  derniere_course_at: string | null
}
type StatsGlobales = {
  nb_operateurs: number
  nb_operateurs_actifs: number
  nb_chauffeurs: number
  nb_passagers: number
  nb_courses: number
  nb_courses_terminees: number
  ca_total: number
}

export default function AdminPage() {
  const supabase = createClient()
  const [chargement, setChargement] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurAuth, setErreurAuth] = useState<string | null>(null)
  const [accesRefuse, setAccesRefuse] = useState(false)
  const [stats, setStats] = useState<StatsGlobales | null>(null)
  const [operateurs, setOperateurs] = useState<OperateurAdmin[]>([])
  const [enCoursId, setEnCoursId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChargement(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    chargerDonnees()
  }, [session])

  async function chargerDonnees() {
    setAccesRefuse(false)
    const { data: op, error: erreurOp } = await supabase.rpc('admin_lister_operateurs')
    const { data: st, error: erreurSt } = await supabase.rpc('admin_stats_globales')
    if (erreurOp || erreurSt) { setAccesRefuse(true); return }
    setOperateurs(op || [])
    setStats(st && st.length > 0 ? st[0] : null)
  }

  async function basculerActif(o: OperateurAdmin) {
    setEnCoursId(o.id)
    await supabase.rpc('admin_definir_statut_operateur', { p_operateur_id: o.id, p_actif: !o.actif })
    setEnCoursId(null)
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

  if (chargement) return null

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h2>Panneau admin plateforme</h2>
          <p className="muted">{mode === 'connexion' ? 'Connectez-vous avec votre compte administrateur.' : 'Créer un compte.'}</p>
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

  if (accesRefuse) {
    return <div className="auth-shell"><div className="auth-card"><p>Ce compte n&apos;a pas accès au panneau admin plateforme.</p></div></div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Panneau admin plateforme</h1>
        <button className="nav-item" style={{ width: 'auto', color: 'var(--muted)' }} onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>

      {stats && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="kpi-card"><div className="muted">Opérateurs</div><div className="value">{stats.nb_operateurs_actifs} / {stats.nb_operateurs}</div></div>
          <div className="kpi-card"><div className="muted">Chauffeurs</div><div className="value">{stats.nb_chauffeurs}</div></div>
          <div className="kpi-card"><div className="muted">Courses (terminées)</div><div className="value">{stats.nb_courses} ({stats.nb_courses_terminees})</div></div>
          {/* "DH" volontairement laisse en dur ici : admin_stats_globales agrege
              le CA de TOUS les operateurs (donc potentiellement plusieurs pays/
              devises a la fois), contrairement aux autres montants de cette page
              qui restent chacun scopes a un seul operateur/une seule devise.
              Un vrai second pays actif rendra cette somme fausse quelle que soit
              l'etiquette -- decision produit a prendre a ce moment-la (repartition
              par devise, ou conversion), pas une simple substitution de texte. */}
          <div className="kpi-card"><div className="muted">CA plateforme</div><div className="value">{stats.ca_total} DH</div></div>
        </div>
      )}

      <h3>Opérateurs</h3>
      <table>
        <tbody>
          <tr>
            <th>Nom</th><th>Ville</th><th>Chauffeurs</th><th>Courses</th><th>CA</th><th>Dernière activité</th><th>Statut</th><th></th>
          </tr>
          {operateurs.length === 0 && <tr><td colSpan={8} className="muted">Aucun opérateur.</td></tr>}
          {operateurs.map((o) => (
            <tr key={o.id}>
              <td><span className="brand-mark" style={{ background: o.couleur_primaire, marginRight: 8 }}>{o.nom[0]}</span>{o.nom}</td>
              <td>{o.ville || '—'}</td>
              <td>{o.nb_chauffeurs}</td>
              <td>{o.nb_courses} ({o.nb_courses_terminees})</td>
              <td>{o.ca_total} {o.devise}</td>
              <td>{o.derniere_course_at ? new Date(o.derniere_course_at).toLocaleString('fr-FR') : '—'}</td>
              <td><span className={`badge ${o.actif ? 'ok' : 'off'}`}>{o.actif ? 'actif' : 'suspendu'}</span></td>
              <td>
                <button className="btn outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} disabled={enCoursId === o.id} onClick={() => basculerActif(o)}>
                  {enCoursId === o.id ? '…' : o.actif ? 'Suspendre' : 'Réactiver'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
