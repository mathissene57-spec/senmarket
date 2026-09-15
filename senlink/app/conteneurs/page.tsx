'use client'

import { useState } from 'react'
import { messageUtilisateur } from '@/lib/errors'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

// ISO 6346 : 4 lettres (3 code proprietaire + 1 identifiant de categorie,
// U/J/Z) + 6 chiffres de serie + 1 chiffre de controle. Verifie le format et
// le chiffre de controle cote client, avant meme d'appeler la fonction —
// evite un aller-retour reseau pour une saisie manifestement invalide, et
// donne un message d'erreur immediat et precis plutot qu'un echec cote API.
const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
}

function chiffreControleValide(numero: string): boolean {
  if (!/^[A-Z]{4}[0-9]{7}$/.test(numero)) return false
  let somme = 0
  for (let i = 0; i < 10; i++) {
    const c = numero[i]
    const valeur = i < 4 ? LETTER_VALUES[c] : Number(c)
    somme += valeur * 2 ** i
  }
  const attendu = (somme % 11) % 10
  return attendu === Number(numero[10])
}

type EvenementConteneur = {
  type: string
  lieu: string
  date: string
  navire?: string | null
}

type ResultatTracking = {
  container_number: string
  provider: string
  recognized: boolean
  carrier_name?: string | null
  vessel?: string | null
  voyage?: string | null
  origin_port?: string | null
  destination_port?: string | null
  eta?: string | null
  current_status?: string | null
  events: EvenementConteneur[]
  verifieManuellement: boolean
}

// Ligne brute renvoyee par public_track_container (une ligne par evenement,
// champs conteneur repetes -- meme forme que get_public_tracking pour les
// colis). null si le conteneur n'a jamais eu d'evenement enregistre.
type LigneTrackingBrute = {
  container_number: string
  container_type: string | null
  carrier_name: string | null
  vessel_name: string | null
  voyage_number: string | null
  current_status: string | null
  eta: string | null
  event_type: string | null
  event_location: string | null
  event_time: string | null
  event_source: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function regrouper(lignes: LigneTrackingBrute[]): ResultatTracking {
  const premiere = lignes[0]
  return {
    container_number: premiere.container_number,
    // Aucun flux fournisseur automatise n'est encore branche (demande
    // d'accès API en cours) — ces donnees ont ete verifiees a la main le
    // 15/09/2026 directement sur les sites Maersk et Visiwise, jamais
    // inventees. `provider` reste honnete sur cette origine.
    provider: 'SenLink — vérifié manuellement (API fournisseur en attente d’accès)',
    recognized: true,
    carrier_name: premiere.carrier_name,
    vessel: premiere.vessel_name,
    voyage: premiere.voyage_number,
    eta: formatDate(premiere.eta),
    current_status: premiere.current_status,
    verifieManuellement: lignes.every((l) => l.event_source === 'manual'),
    events: lignes
      .filter((l) => l.event_type !== null)
      .map((l) => ({
        type: l.event_type as string,
        lieu: l.event_location ?? '',
        date: formatDate(l.event_time),
      })),
  }
}

export default function TrackerConteneurPage() {
  const supabase = createClient()

  const [numero, setNumero] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<ResultatTracking | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const propre = numero.trim().toUpperCase()

    if (!chiffreControleValide(propre)) {
      setErreur('Numéro de conteneur invalide — format attendu : 4 lettres suivies de 7 chiffres (ex. MSKU7478609).')
      setResultat(null)
      return
    }

    setLoading(true)
    setErreur(null)
    setResultat(null)

    try {
      const { data, error } = await supabase.rpc('public_track_container', {
        p_container_number: propre,
      })
      if (error) throw error
      const lignes = (data ?? []) as LigneTrackingBrute[]
      if (lignes.length === 0) {
        setResultat({
          container_number: propre,
          provider: '',
          recognized: false,
          events: [],
          verifieManuellement: false,
        })
      } else {
        setResultat(regrouper(lignes))
      }
    } catch (e) {
      setErreur(messageUtilisateur(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.page}>
      <p style={styles.kicker}>SenLink — Tracker un conteneur</p>
      <h1 style={styles.titre}>Un numéro. Une recherche. Un résultat.</h1>
      <p style={styles.soustitre}>
        Entrez un numéro de conteneur réel — aucune information sur l'armateur, les ports ou l'ETA n'est nécessaire.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Ex. MSKU7478609"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          maxLength={11}
        />
        <button style={styles.bouton} type="submit" disabled={loading || numero.trim().length === 0}>
          {loading ? 'Recherche...' : 'Rechercher'}
        </button>
      </form>

      {erreur && <div style={styles.msgErr}>{erreur}</div>}

      {resultat && !resultat.recognized && (
        <div style={styles.msgErr}>
          Ce numéro n'a pas été retrouvé par notre fournisseur de tracking. Vérifiez qu'il s'agit bien d'un
          conteneur actif récemment (les conteneurs très anciens ou déjà restitués vides depuis longtemps
          peuvent ne plus être suivis).
        </div>
      )}

      {resultat && resultat.recognized && (
        <div className="sl-fade-in" style={styles.resultCard}>
          {resultat.verifieManuellement && (
            <div style={styles.avisManuel}>
              Donnée vérifiée manuellement le 15/09/2026 auprès du transporteur — la connexion à un flux
              fournisseur automatisé est en cours de mise en place.
            </div>
          )}
          <div style={styles.resultHead}>
            <div>
              <p style={styles.resultKicker}>Conteneur</p>
              <h2 style={styles.resultNumero}>{resultat.container_number}</h2>
            </div>
            {resultat.current_status && <span style={styles.statutBadge}>{resultat.current_status}</span>}
          </div>

          <div style={styles.grille}>
            {resultat.carrier_name && (
              <div style={styles.champ}>
                <span style={styles.champLabel}>Transporteur</span>
                <span style={styles.champValeur}>{resultat.carrier_name}</span>
              </div>
            )}
            {resultat.vessel && (
              <div style={styles.champ}>
                <span style={styles.champLabel}>Navire</span>
                <span style={styles.champValeur}>
                  {resultat.vessel}
                  {resultat.voyage ? ` / ${resultat.voyage}` : ''}
                </span>
              </div>
            )}
            {resultat.origin_port && (
              <div style={styles.champ}>
                <span style={styles.champLabel}>Origine</span>
                <span style={styles.champValeur}>{resultat.origin_port}</span>
              </div>
            )}
            {resultat.destination_port && (
              <div style={styles.champ}>
                <span style={styles.champLabel}>Destination</span>
                <span style={styles.champValeur}>{resultat.destination_port}</span>
              </div>
            )}
            {resultat.eta && (
              <div style={styles.champ}>
                <span style={styles.champLabel}>ETA</span>
                <span style={styles.champValeur}>{resultat.eta}</span>
              </div>
            )}
            <div style={styles.champ}>
              <span style={styles.champLabel}>Source</span>
              <span style={styles.champValeur}>{resultat.provider}</span>
            </div>
          </div>

          {resultat.events.length > 0 && (
            <>
              <p style={styles.sousTitre}>Historique</p>
              <ul style={styles.liste}>
                {resultat.events.map((ev, i) => (
                  <li key={i} style={styles.ligne}>
                    <div style={styles.ligneType}>{ev.type}</div>
                    <div style={styles.ligneLoc}>
                      {ev.lieu}
                      {ev.navire ? ` — ${ev.navire}` : ''}
                    </div>
                    <div style={styles.ligneDate}>{ev.date}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: 'clamp(32px, 6vw, 48px) clamp(16px, 4vw, 24px) 64px' },
  kicker: { fontSize: 11.5, fontWeight: 700, color: color.green600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, color: color.inkStrong, margin: '0 0 4px' },
  soustitre: { color: color.muted, fontSize: 14, margin: '0 0 28px' },
  form: { display: 'flex', gap: 10, marginBottom: 20 },
  input: { ...shared.input, flex: 1, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 1 },
  bouton: shared.boutonPrimaire,
  msgErr: { padding: 12, borderRadius: 8, background: color.dangerTint, color: color.danger, fontSize: 13, marginBottom: 20 },
  avisManuel: { padding: 12, borderRadius: 8, background: color.goldTint, color: '#8A6100', fontSize: 12.5, marginBottom: 18 },
  resultCard: { ...shared.card, padding: 24 },
  resultHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  resultKicker: { fontSize: 11, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 2px' },
  resultNumero: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: color.inkStrong, margin: 0 },
  statutBadge: {
    padding: '6px 14px', borderRadius: 999, background: color.goldTint, color: '#8A6100',
    fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
  },
  grille: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 },
  champ: { display: 'flex', flexDirection: 'column', gap: 2 },
  champLabel: { fontSize: 10.5, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  champValeur: { fontSize: 14, color: color.ink, fontWeight: 600 },
  sousTitre: { fontSize: 12, fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' },
  liste: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  ligne: { border: `1px solid ${color.border}`, borderRadius: 10, padding: '10px 14px' },
  ligneType: { fontWeight: 700, fontSize: 13.5, color: color.inkStrong },
  ligneLoc: { fontSize: 12.5, color: color.muted, marginTop: 2 },
  ligneDate: { fontSize: 11, color: color.muted, marginTop: 2 },
}
