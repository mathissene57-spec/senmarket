'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

type Container = {
  id: string
  container_number: string
  current_status: string
  customs_status: string | null
  destination_port_id: string | null
}

type Port = { code: string; name: string; country: string | null }
type Pays = { code: string; name: string }

type Evenement = {
  id: string
  container_id: string
  event_type: string
  event_time: string
  location_text: string | null
  source: string
}

const OPTIONS_DOUANE: { value: string; label: string }[] = [
  { value: 'pending', label: 'En attente de dédouanement' },
  { value: 'on_hold', label: 'Bloqué en douane' },
  { value: 'cleared', label: 'Dédouané' },
]

// Miroir du libellé posé côté base (notify_org_on_container_event) — même
// vocabulaire, seules les 9 valeurs event_type réellement utilisées à ce
// jour sont couvertes ; toute valeur future non listée retombe sur le
// texte brut, jamais un libellé inventé.
const LABELS_EVENEMENT: Record<string, string> = {
  empty_container_handoff: 'Remise du conteneur vide',
  gate_in: 'Entrée au terminal',
  load: 'Chargement',
  vessel_departure: 'Départ du navire',
  vessel_arrival: 'Arrivée du navire',
  discharge: 'Déchargement',
  customs_pending: 'En attente de dédouanement',
  customs_hold: 'Bloqué en douane',
  customs_cleared: 'Dédouané',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ConteneursDouanePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [conteneurs, setConteneurs] = useState<Container[]>([])
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [pays, setPays] = useState<Pays[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [choixStatut, setChoixStatut] = useState<Record<string, string>>({})
  const [lieux, setLieux] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [conteneursRes, evenementsRes, portsRes, paysRes] = await Promise.all([
        supabase
          .from('containers')
          .select('id, container_number, current_status, customs_status, destination_port_id')
          .order('created_at', { ascending: false }),
        // container_events_select (can_access_container) couvre déjà le même
        // périmètre que containers_org_select — pas de filtre supplémentaire
        // nécessaire, RLS renvoie uniquement les événements des conteneurs
        // visibles par l'utilisateur courant.
        supabase
          .from('container_events')
          .select('id, container_id, event_type, event_time, location_text, source')
          .order('event_time', { ascending: true }),
        // ports_public_read : lecture ouverte à tous, référentiel volontairement
        // très court (1 port réel à ce jour) — chargé en entier, pas de filtre.
        supabase.from('ports').select('code, name, country'),
        supabase.from('countries').select('code, name'),
      ])
      if (conteneursRes.error) throw conteneursRes.error
      if (evenementsRes.error) throw evenementsRes.error
      if (portsRes.error) throw portsRes.error
      if (paysRes.error) throw paysRes.error
      setConteneurs((conteneursRes.data ?? []) as Container[])
      setEvenements((evenementsRes.data ?? []) as Evenement[])
      setPorts((portsRes.data ?? []) as Port[])
      setPays((paysRes.data ?? []) as Pays[])
    } catch (e) {
      setErreur(messageUtilisateur(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function destinationLabel(c: Container): string | null {
    if (!c.destination_port_id) return null
    const port = ports.find((p) => p.code === c.destination_port_id)
    if (!port) return null
    const pays_ = port.country ? pays.find((p) => p.code === port.country) : null
    return pays_ ? `${port.name}, ${pays_.name}` : port.name
  }

  // Le dédouanement ne dit pas où retirer le colis — c'est le lieu saisi sur
  // l'événement customs_cleared lui-même qui porte cette info (même champ
  // que pour tout autre événement, pas une nouvelle colonne). On prend le
  // plus récent en cas de saisies successives.
  function lieuRetrait(c: Container): string | null {
    if (c.customs_status !== 'cleared') return null
    const dedouanements = evenements.filter((e) => e.container_id === c.id && e.event_type === 'customs_cleared')
    return dedouanements[dedouanements.length - 1]?.location_text ?? null
  }

  async function handleEnregistrer(c: Container) {
    const statut = choixStatut[c.id]
    if (!statut) {
      setMsg({ text: 'Choisissez un statut douanier avant d’enregistrer.', type: 'err' })
      return
    }
    setBusy(c.id)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('record_container_customs_event', {
        p_container_id: c.id,
        p_customs_status: statut,
        p_location_text: lieux[c.id]?.trim() || null,
      })
      if (error) throw error
      setMsg({ text: `${c.container_number} → ${OPTIONS_DOUANE.find((o) => o.value === statut)?.label}`, type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard" style={styles.retour}>
          ← Tableau de bord
        </Link>
        <h1 style={styles.titre}>Statut douanier des conteneurs</h1>
        <p style={styles.soustitre}>
          Saisie manuelle du statut de dédouanement — dès que vous apprenez (du courtier, du terminal, ou
          directement de la douane) qu'un conteneur est en attente, bloqué ou dédouané, enregistrez-le ici.
          Visible immédiatement sur la page publique de suivi. Seuls les conteneurs de votre organisation
          apparaissent ci-dessous.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les conteneurs pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && conteneurs.length === 0 && (
        <p style={styles.vide}>Aucun conteneur enregistré pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {conteneurs.map((c) => (
          <div key={c.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.code}>{c.container_number}</span>
              <span style={styles.badge}>{c.current_status}</span>
            </div>
            {destinationLabel(c) && <div style={styles.destination}>Destination : {destinationLabel(c)}</div>}
            {c.customs_status && (
              <div style={styles.douaneActuelle}>
                Statut douanier actuel : {OPTIONS_DOUANE.find((o) => o.value === c.customs_status)?.label ?? c.customs_status}
              </div>
            )}
            {c.customs_status === 'cleared' && (
              <div style={styles.avisRetrait}>
                {lieuRetrait(c)
                  ? `Colis à retirer à : ${lieuRetrait(c)}`
                  : 'Aucun lieu de retrait renseigné pour l’instant — à ajouter dès que connu.'}
              </div>
            )}

            <select
              style={styles.select}
              value={choixStatut[c.id] ?? ''}
              onChange={(e) => setChoixStatut({ ...choixStatut, [c.id]: e.target.value })}
            >
              <option value="">— Choisir un nouveau statut douanier —</option>
              {OPTIONS_DOUANE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              style={styles.input}
              placeholder={
                choixStatut[c.id] === 'cleared'
                  ? 'Adresse du dépôt où le client peut retirer son colis'
                  : 'Lieu (optionnel, ex. Port de Subic, Philippines)'
              }
              value={lieux[c.id] ?? ''}
              onChange={(e) => setLieux({ ...lieux, [c.id]: e.target.value })}
            />

            <button style={styles.bouton} disabled={busy === c.id} onClick={() => handleEnregistrer(c)}>
              {busy === c.id ? 'Enregistrement…' : 'Enregistrer le statut douanier'}
            </button>

            <div style={styles.historique}>
              <div style={styles.historiqueTitre}>Chronologie</div>
              {evenements.filter((e) => e.container_id === c.id).length === 0 && (
                <div style={styles.vide}>Aucun événement enregistré pour l&apos;instant.</div>
              )}
              <ul style={styles.liste}>
                {evenements
                  .filter((e) => e.container_id === c.id)
                  .map((e) => (
                    <li key={e.id} style={styles.ligne}>
                      <div style={styles.ligneHaut}>
                        <span style={styles.ligneType}>{LABELS_EVENEMENT[e.event_type] ?? e.event_type}</span>
                        <span style={styles.ligneDate}>{formatDate(e.event_time)}</span>
                      </div>
                      {e.location_text && <div style={styles.ligneLieu}>{e.location_text}</div>}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: color.green600, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: color.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: color.muted, fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: color.greenTint, color: color.green600, fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: color.dangerTint, color: color.danger, fontSize: 13, marginBottom: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: { ...shared.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontWeight: 700, fontSize: 14, color: color.inkStrong, fontFamily: 'monospace' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: color.goldTint, color: '#8A6100',
  },
  douaneActuelle: { fontSize: 12.5, color: color.muted, fontStyle: 'italic' },
  destination: { fontSize: 12.5, color: color.muted },
  avisRetrait: { padding: 12, borderRadius: 8, background: color.greenTint, color: color.green600, fontSize: 12.5, lineHeight: 1.5 },
  select: shared.input,
  input: shared.input,
  bouton: shared.boutonPrimaire,
  historique: { marginTop: 4, paddingTop: 14, borderTop: `1px solid ${color.borderStrong}` },
  historiqueTitre: { fontWeight: 700, fontSize: 12.5, color: color.inkStrong, marginBottom: 8 },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' },
  ligne: { fontSize: 12.5 },
  ligneHaut: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  ligneType: { fontWeight: 600, color: color.inkStrong },
  ligneDate: { color: color.muted, whiteSpace: 'nowrap' },
  ligneLieu: { color: color.muted, fontStyle: 'italic' },
}
