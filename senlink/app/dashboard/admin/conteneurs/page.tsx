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
}

const OPTIONS_DOUANE: { value: string; label: string }[] = [
  { value: 'pending', label: 'En attente de dédouanement' },
  { value: 'on_hold', label: 'Bloqué en douane' },
  { value: 'cleared', label: 'Dédouané' },
]

export default function AdminConteneursPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [conteneurs, setConteneurs] = useState<Container[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [choixStatut, setChoixStatut] = useState<Record<string, string>>({})
  const [lieux, setLieux] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase
        .from('containers')
        .select('id, container_number, current_status, customs_status')
        .order('created_at', { ascending: false })
      if (error) throw error
      setConteneurs((data ?? []) as Container[])
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
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Statut douanier des conteneurs</h1>
        <p style={styles.soustitre}>
          Saisie manuelle du statut de dédouanement — dès qu'un transitaire ou correspondant SenLink vous
          informe qu'un conteneur est en attente, bloqué ou dédouané, enregistrez-le ici. Visible
          immédiatement sur la page publique de suivi.
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
            {c.customs_status && (
              <div style={styles.douaneActuelle}>
                Statut douanier actuel : {OPTIONS_DOUANE.find((o) => o.value === c.customs_status)?.label ?? c.customs_status}
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
              placeholder="Lieu (optionnel, ex. Port de Subic, Philippines)"
              value={lieux[c.id] ?? ''}
              onChange={(e) => setLieux({ ...lieux, [c.id]: e.target.value })}
            />

            <button style={styles.bouton} disabled={busy === c.id} onClick={() => handleEnregistrer(c)}>
              {busy === c.id ? 'Enregistrement…' : 'Enregistrer le statut douanier'}
            </button>
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
  select: shared.input,
  input: shared.input,
  bouton: shared.boutonPrimaire,
}
