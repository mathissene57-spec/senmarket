'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

type Organisation = { id: string; name: string }

type Transitaire = {
  user_id: string
  email: string
  full_name: string | null
  organization_id: string
  organization_name: string | null
  created_at: string
}

export default function AdminTransitairesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [transitaires, setTransitaires] = useState<Transitaire[]>([])

  const [email, setEmail] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [orgsRes, transitairesRes] = await Promise.all([
        supabase.from('organizations').select('id, name').eq('type', 'client').order('name'),
        supabase.rpc('admin_list_transitaires'),
      ])
      if (orgsRes.error) throw orgsRes.error
      if (transitairesRes.error) throw transitairesRes.error

      setOrganisations((orgsRes.data ?? []) as Organisation[])
      setTransitaires((transitairesRes.data ?? []) as Transitaire[])
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

  async function handleAssign() {
    if (!email.trim() || !organizationId) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_assign_transitaire', {
        p_email: email.trim(),
        p_organization_id: organizationId,
      })
      if (error) throw error
      setMsg({ text: `${email.trim()} affecté(e) comme transitaire.`, type: 'ok' })
      setEmail('')
      setOrganizationId('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(t: Transitaire) {
    const key = `${t.user_id}:${t.organization_id}`
    setRemovingKey(key)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', t.user_id)
        .eq('role', 'transitaire')
        .eq('organization_id', t.organization_id)
      if (error) throw error
      setMsg({ text: `${t.email} retiré(e) de ${t.organization_name ?? 'cette organisation'}.`, type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setRemovingKey(null)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Transitaires partenaires</h1>
        <p style={styles.soustitre}>
          Affecte un compte existant comme transitaire sur une organisation cliente : il pourra alors
          consulter les conteneurs de cette organisation et saisir directement leur statut douanier, sans
          passer par un administrateur SenLink.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Affecter un transitaire</div>
        <input
          style={shared.input}
          placeholder="Email du compte SenLink déjà créé"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select style={shared.input} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
          <option value="">Organisation cliente…</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button
          style={shared.boutonPrimaire}
          disabled={!email.trim() || !organizationId || submitting}
          onClick={handleAssign}
        >
          {submitting ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && transitaires.length === 0 && (
        <p style={styles.vide}>Aucun transitaire affecté pour l&apos;instant.</p>
      )}
      {!loading && !erreur && organisations.length === 0 && (
        <p style={styles.vide}>Aucune organisation cliente pour l&apos;instant — rien à affecter.</p>
      )}

      <div style={styles.list}>
        {transitaires.map((t) => (
          <div key={`${t.user_id}:${t.organization_id}`} style={{ ...shared.card, ...styles.card }}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{t.full_name || t.email}</span>
            </div>
            <div style={styles.ligne}>{t.email}</div>
            <div style={styles.ligneActuel}>Organisation : {t.organization_name ?? '—'}</div>
            <button
              style={styles.boutonDanger}
              disabled={removingKey === `${t.user_id}:${t.organization_id}`}
              onClick={() => handleRemove(t)}
            >
              {removingKey === `${t.user_id}:${t.organization_id}` ? '…' : 'Retirer'}
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  head: { marginBottom: 24 },
  retour: { color: color.green600, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  soustitre: { color: color.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 560 },
  vide: { color: color.muted, fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: color.greenTint, color: color.green600, fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: color.dangerTint, color: color.danger, fontSize: 13, marginBottom: 16 },
  createBox: {
    border: `1px dashed ${color.borderStrong}`, borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: color.surface,
    maxWidth: 420,
  },
  createTitre: { fontWeight: 700, fontSize: 13.5, color: color.inkStrong },
  list: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 },
  card: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: color.inkStrong },
  ligne: { fontSize: 13, color: color.muted },
  ligneActuel: { fontSize: 12.5, color: color.muted, fontStyle: 'italic' },
  boutonDanger: {
    padding: '12px 20px', borderRadius: 10, border: `1px solid ${color.danger}`,
    background: color.dangerTint, color: color.danger, fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
}
