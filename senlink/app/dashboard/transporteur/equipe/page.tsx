'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Member = { user_id: string; full_name: string | null; email: string; joined_at: string }

export default function EquipePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase.rpc('get_team_members')
      if (error) throw error
      setMembers((data ?? []) as Member[])
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd() {
    if (!email.trim()) return
    setSubmitting(true)
    setMsg(null)
    const { error } = await supabase.rpc('add_team_member', {
      p_email: email.trim(),
      p_acting_role: 'transporteur',
    })
    setSubmitting(false)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Membre ajouté.', type: 'ok' })
    setEmail('')
    load()
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)
    setMsg(null)
    const { error } = await supabase.rpc('remove_team_member', {
      p_user_id: userId,
      p_acting_role: 'transporteur',
    })
    setRemoving(null)
    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }
    setMsg({ text: 'Membre retiré.', type: 'ok' })
    load()
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/transporteur" style={styles.retour}>
          ← Espace transporteur
        </Link>
        <h1 style={styles.titre}>Équipe</h1>
        <p style={styles.soustitre}>
          Ajoute un collègue ayant déjà un compte SenLink — il obtient
          exactement les mêmes accès que toi sur ce transporteur.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger l&apos;équipe pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}

      {!loading && !erreur && (
        <div style={styles.createBox}>
          <input
            style={styles.input}
            type="email"
            placeholder="email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button style={styles.bouton} disabled={!email.trim() || submitting} onClick={handleAdd}>
            {submitting ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      )}

      {!loading && !erreur && (
        <div style={styles.list}>
          {members.map((m) => (
            <div key={m.user_id} style={styles.card}>
              <div>
                <div style={styles.nom}>{m.full_name || m.email}</div>
                <div style={styles.email}>{m.email}</div>
              </div>
              <button
                style={styles.boutonMini}
                disabled={removing === m.user_id || members.length <= 1}
                onClick={() => handleRemove(m.user_id)}
              >
                {removing === m.user_id ? '…' : 'Retirer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 480, margin: '0 auto', padding: '32px 24px 64px' },
  head: { marginBottom: 24 },
  retour: { color: '#00875A', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#3D3D3D', fontSize: 14 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  createBox: { display: 'flex', gap: 8, marginBottom: 24 },
  input: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    border: '1px solid #E8E2D9', borderRadius: 12, padding: 14, background: '#fff',
  },
  nom: { fontWeight: 700, fontSize: 14, color: '#0A1A0F' },
  email: { fontSize: 12.5, color: '#6A8572', marginTop: 2 },
  bouton: { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0A1A0F', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' },
  boutonMini: { padding: '6px 12px', borderRadius: 8, border: '1px solid #C41E3A', background: '#fff', color: '#C41E3A', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
}
