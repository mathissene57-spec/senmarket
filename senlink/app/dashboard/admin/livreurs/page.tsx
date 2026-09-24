'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

type Livreur = {
  user_id: string
  email: string
  full_name: string | null
  created_at: string
}

export default function AdminLivreursPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [livreurs, setLivreurs] = useState<Livreur[]>([])
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase.rpc('admin_list_livreurs')
      if (error) throw error
      setLivreurs((data ?? []) as Livreur[])
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
    if (!email.trim()) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_assign_livreur', { p_email: email.trim() })
      if (error) throw error
      setMsg({ text: `${email.trim()} affecté(e) comme livreur.`, type: 'ok' })
      setEmail('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(livreur: Livreur) {
    setRemovingId(livreur.user_id)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', livreur.user_id)
        .eq('role', 'livreur')
      if (error) throw error
      setMsg({ text: `${livreur.email} retiré(e) du rôle livreur.`, type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Livreurs</h1>
        <p style={styles.soustitre}>
          Affecte un compte existant au rôle livreur — livraison Dakar et
          interrégionale (Branche 3). Un livreur se voit ensuite affecter des
          colis un par un, en les scannant ou en cherchant leur code de suivi
          depuis son espace de travail.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Affecter un livreur</div>
        <input
          style={shared.input}
          placeholder="Email du compte SenLink déjà créé"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button style={shared.boutonPrimaire} disabled={!email.trim() || submitting} onClick={handleAssign}>
          {submitting ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && livreurs.length === 0 && (
        <p style={styles.vide}>Aucun livreur pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {livreurs.map((l) => (
          <div key={l.user_id} style={{ ...shared.card, ...styles.card }}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{l.full_name || l.email}</span>
              <button
                style={styles.boutonDanger}
                disabled={removingId === l.user_id}
                onClick={() => handleRemove(l)}
              >
                {removingId === l.user_id ? '…' : 'Retirer'}
              </button>
            </div>
            <div style={styles.ligne}>{l.email}</div>
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
  card: { padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nom: { fontWeight: 700, fontSize: 15, color: color.inkStrong },
  ligne: { fontSize: 13, color: color.muted },
  boutonDanger: {
    padding: '8px 14px', borderRadius: 10, border: `1px solid ${color.danger}`,
    background: color.dangerTint, color: color.danger, fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
  },
}
