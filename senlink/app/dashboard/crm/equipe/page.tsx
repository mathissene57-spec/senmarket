'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

export type CrmRole = 'direction' | 'business' | 'logistics' | 'transporter_relations'

export const CRM_ROLE_LABELS: Record<CrmRole, string> = {
  direction: 'Direction',
  business: 'Développement / Relations',
  logistics: 'Logistique / Transit',
  transporter_relations: 'Relations Transporteurs',
}

export type MembreCrm = {
  user_id: string
  email: string
  full_name: string | null
  crm_role: CrmRole
  created_at: string
}

export default function CrmEquipePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [membres, setMembres] = useState<MembreCrm[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CrmRole | ''>('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase.rpc('admin_list_crm_team')
      if (error) throw error
      setMembres((data ?? []) as MembreCrm[])
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

  async function handleAffecter() {
    if (!email.trim() || !role) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_assign_crm_role', {
        p_email: email.trim(),
        p_crm_role: role,
      })
      if (error) throw error
      setMsg({ text: `${email.trim()} affecté(e) — ${CRM_ROLE_LABELS[role]}.`, type: 'ok' })
      setEmail('')
      setRole('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/crm" style={styles.retour}>
          ← CRM SenLink
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Équipe</h1>
        <p style={styles.soustitre}>
          Affecte un compte SenLink existant à un rôle CRM interne — Direction, Développement, Logistique ou
          Relations Transporteurs. Réservé à un administrateur ; le reste de l&apos;équipe peut consulter cette
          liste.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Affecter un membre</div>
        <input
          style={shared.input}
          placeholder="Email du compte SenLink déjà créé"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select style={shared.input} value={role} onChange={(e) => setRole(e.target.value as CrmRole)}>
          <option value="">Rôle CRM…</option>
          {(Object.keys(CRM_ROLE_LABELS) as CrmRole[]).map((r) => (
            <option key={r} value={r}>
              {CRM_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button style={shared.boutonPrimaire} disabled={!email.trim() || !role || submitting} onClick={handleAffecter}>
          {submitting ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && membres.length === 0 && <p style={styles.vide}>Aucun membre CRM pour l&apos;instant.</p>}

      <div style={styles.list}>
        {membres.map((m) => (
          <div key={m.user_id} style={{ ...shared.card, ...styles.card }}>
            <span style={styles.nom}>{m.full_name || m.email}</span>
            <span style={styles.ligne}>{m.email}</span>
            <span style={styles.badge}>{CRM_ROLE_LABELS[m.crm_role]}</span>
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
  list: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 },
  card: { padding: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  nom: { fontWeight: 700, fontSize: 14, color: color.inkStrong },
  ligne: { fontSize: 12.5, color: color.muted },
  badge: {
    alignSelf: 'flex-start', marginTop: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
    background: color.goldTint, color: '#8A6100',
  },
}
