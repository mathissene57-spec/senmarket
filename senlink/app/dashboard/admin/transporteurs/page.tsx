'use client'

import { messageErreur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Transporter = {
  id: string
  name: string
  country_scope: string[] | null
  trust_score: number | null
  active: boolean
}

type Country = { code: string; name: string }

export default function AdminTransporteursPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [transporteurs, setTransporteurs] = useState<Transporter[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [scope, setScope] = useState<string[]>([])

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [transRes, countriesRes] = await Promise.all([
        supabase
          .from('transporters')
          .select('id, name, country_scope, trust_score, active')
          .order('name'),
        supabase.from('countries').select('code, name').eq('active', true).order('name'),
      ])
      if (transRes.error) throw transRes.error
      if (countriesRes.error) throw countriesRes.error
      setTransporteurs((transRes.data ?? []) as Transporter[])
      setCountries((countriesRes.data ?? []) as Country[])
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleScope(code: string) {
    setScope((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  async function handleCreate() {
    if (!name.trim()) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('transporters').insert({
        name: name.trim(),
        country_scope: scope.length > 0 ? scope : null,
      })
      if (error) throw error
      setMsg({ text: 'Transporteur créé.', type: 'ok' })
      setName('')
      setScope([])
      load()
    } catch (e) {
      setMsg({ text: messageErreur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(t: Transporter) {
    setTogglingId(t.id)
    setMsg(null)
    try {
      const { error } = await supabase.from('transporters').update({ active: !t.active }).eq('id', t.id)
      if (error) throw error
      load()
    } catch (e) {
      setMsg({ text: messageErreur(e), type: 'err' })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Transporteurs</h1>
        <p style={styles.soustitre}>
          {transporteurs.length} transporteur(s) enregistré(s) sur le réseau.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Créer un transporteur</div>
        <input style={styles.input} placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={styles.checkboxRow}>
          {countries.map((c) => (
            <label key={c.code} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={scope.includes(c.code)}
                onChange={() => toggleScope(c.code)}
              />
              {c.name}
            </label>
          ))}
        </div>
        <button style={styles.bouton} disabled={!name.trim() || submitting} onClick={handleCreate}>
          {submitting ? 'Création…' : 'Créer le transporteur'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les transporteurs pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && transporteurs.length === 0 && (
        <p style={styles.vide}>Aucun transporteur enregistré.</p>
      )}

      <div style={styles.list}>
        {transporteurs.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{t.name}</span>
              <span style={t.active ? styles.badgeActif : styles.badgeInactif}>
                {t.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <div style={styles.ligne}>
              Zone : {t.country_scope && t.country_scope.length > 0 ? t.country_scope.join(', ') : '—'}
            </div>
            <div style={styles.ligne}>
              Trust score : {t.trust_score != null ? t.trust_score : '—'}
            </div>
            <button
              style={styles.boutonSecondaire}
              disabled={togglingId === t.id}
              onClick={() => handleToggleActive(t)}
            >
              {togglingId === t.id ? '…' : t.active ? 'Désactiver' : 'Réactiver'}
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
  retour: { color: '#00875A', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#3D3D3D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FFF3F3', color: '#C41E3A', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13, marginBottom: 16 },
  createBox: {
    border: '1px dashed #C9C0AE', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: '#fff',
  },
  createTitre: { fontWeight: 700, fontSize: 13.5, color: '#0A1A0F' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D9', fontSize: 13.5 },
  checkboxRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#3D3D3D' },
  bouton: {
    padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0A1A0F',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  boutonSecondaire: {
    alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid #E8E2D9',
    background: '#fff', color: '#0A1A0F', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: '#0A1A0F' },
  badgeActif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#EAFBF2', color: '#00875A',
  },
  badgeInactif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#F1F1F1', color: '#6A6A6A',
  },
  ligne: { fontSize: 13, color: '#3D3D3D' },
}
