'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// P2.3 : creer un operateur sans intervention manuelle en base. Le
// "provisionnement assiste" (provisionner_operateur, service_role) reste
// disponible pour un onboarding accompagne ; celui-ci est le chemin
// self-service, ouvert a tout compte authentifie.
function slugifier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function OnboardingPage() {
  const supabase = createClient()
  const [chargement, setChargement] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [mode, setMode] = useState<'connexion' | 'inscription'>('inscription')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurAuth, setErreurAuth] = useState<string | null>(null)

  const [nom, setNom] = useState('')
  const [slug, setSlug] = useState('')
  const [slugModifieManuellement, setSlugModifieManuellement] = useState(false)
  const [ville, setVille] = useState('')
  const [couleurPrimaire, setCouleurPrimaire] = useState('#101B3D')
  const [couleurSecondaire, setCouleurSecondaire] = useState('#FF7A28')
  const [zoneNom, setZoneNom] = useState('Centre-ville')
  const [zoneTarifBase, setZoneTarifBase] = useState(10)
  const [zoneTarifKm, setZoneTarifKm] = useState(2)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [slugCree, setSlugCree] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChargement(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!slugModifieManuellement) setSlug(slugifier(nom))
  }, [nom, slugModifieManuellement])

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

  async function creerOperateur() {
    setErreur(null)
    if (!nom.trim() || !slug.trim() || !zoneNom.trim()) { setErreur('Nom, slug et zone tarifaire sont requis.'); return }
    setEnvoi(true)
    const { error } = await supabase.rpc('creer_mon_operateur', {
      p_nom: nom,
      p_slug: slug,
      p_ville: ville,
      p_couleur_primaire: couleurPrimaire,
      p_couleur_secondaire: couleurSecondaire,
      p_zone_nom: zoneNom,
      p_zone_tarif_base: zoneTarifBase,
      p_zone_tarif_km: zoneTarifKm,
    })
    setEnvoi(false)
    if (error) { setErreur(error.message); return }
    setSlugCree(slug)
  }

  if (chargement) return null

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px', fontFamily: 'inherit' }}>
      <h1>Créer mon opérateur</h1>
      <p className="muted">Onboarding self-service — votre plateforme de mobilité en marque blanche, prête en une minute.</p>

      {!session && (
        <div className="card" style={{ marginTop: 24, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>{mode === 'connexion' ? 'Connexion' : 'Créer un compte'}</h3>
          <label className="field-label">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="field-label">Mot de passe</label>
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          {erreurAuth && <p className="error-text">{erreurAuth}</p>}
          <button className="btn" onClick={mode === 'connexion' ? seConnecter : sInscrire}>
            {mode === 'connexion' ? 'Se connecter' : "Créer mon compte"}
          </button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}>
            {mode === 'connexion' ? "Pas encore de compte ? En créer un" : 'Déjà un compte ? Se connecter'}
          </button>
        </div>
      )}

      {session && slugCree && (
        <div className="card" style={{ marginTop: 24, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>🎉 Opérateur créé</h3>
          <p className="muted">Votre plateforme est active immédiatement, sur ces liens :</p>
          <ul>
            <li><Link href={`/o/${slugCree}/passager`}>Application passager</Link></li>
            <li><Link href={`/o/${slugCree}/chauffeur`}>Application chauffeur</Link></li>
            <li><Link href={`/o/${slugCree}/dashboard`}>Dashboard opérateur</Link> (ajoutez vos chauffeurs ici)</li>
          </ul>
          <Link href={`/o/${slugCree}/dashboard`} className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
            Aller au dashboard
          </Link>
        </div>
      )}

      {session && !slugCree && (
        <div className="card" style={{ marginTop: 24, padding: 20 }}>
          <label className="field-label">Nom de l&apos;opérateur</label>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Casa Rapide" />
          <label className="field-label">Adresse de vos apps (généré, modifiable)</label>
          <input type="text" value={slug} onChange={(e) => { setSlug(slugifier(e.target.value)); setSlugModifieManuellement(true) }} />
          <p className="muted" style={{ marginTop: -8 }}>/o/{slug || '…'}/passager</p>
          <label className="field-label">Ville</label>
          <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex : Casablanca" />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Couleur principale</label>
              <input type="color" value={couleurPrimaire} onChange={(e) => setCouleurPrimaire(e.target.value)} style={{ width: '100%', height: 44, padding: 4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Couleur secondaire</label>
              <input type="color" value={couleurSecondaire} onChange={(e) => setCouleurSecondaire(e.target.value)} style={{ width: '100%', height: 44, padding: 4 }} />
            </div>
          </div>
          <h4>Première zone tarifaire</h4>
          <label className="field-label">Nom de la zone</label>
          <input type="text" value={zoneNom} onChange={(e) => setZoneNom(e.target.value)} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Prix de base (DH)</label>
              <input type="number" min="0" step="0.5" value={zoneTarifBase} onChange={(e) => setZoneTarifBase(parseFloat(e.target.value) || 0)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Prix / km (DH)</label>
              <input type="number" min="0" step="0.1" value={zoneTarifKm} onChange={(e) => setZoneTarifKm(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          {erreur && <p className="error-text">{erreur}</p>}
          <button className="btn accent" onClick={creerOperateur} disabled={envoi}>
            {envoi ? 'Création…' : 'Créer mon opérateur'}
          </button>
        </div>
      )}
    </div>
  )
}
