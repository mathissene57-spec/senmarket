'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Country = {
  code: string
  name: string
  default_currency: string
  active: boolean
}

export default function AdminCountriesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<Country[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingCode, setTogglingCode] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('')

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('code, name, default_currency, active')
        .order('name')
      if (error) throw error
      setCountries((data ?? []) as Country[])
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

  async function handleCreate() {
    if (!code.trim() || !name.trim() || !currency.trim()) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('countries').insert({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        default_currency: currency.trim().toUpperCase(),
      })
      if (error) throw error
      setMsg({ text: 'Pays créé.', type: 'ok' })
      setCode('')
      setName('')
      setCurrency('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(country: Country) {
    setTogglingCode(country.code)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('countries')
        .update({ active: !country.active })
        .eq('code', country.code)
      if (error) throw error
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setTogglingCode(null)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={styles.titre}>Pays</h1>
        <p style={styles.soustitre}>
          {countries.length} pays enregistré(s). Un pays désactivé disparaît des listes
          proposées ailleurs (hubs, points relais, corridors) sans supprimer les données existantes.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Ajouter un pays</div>
        <input
          style={styles.input}
          placeholder="Code ISO (ex: MA)"
          value={code}
          maxLength={2}
          onChange={(e) => setCode(e.target.value)}
        />
        <input style={styles.input} placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          style={styles.input}
          placeholder="Devise par défaut (ex: MAD)"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <button
          style={styles.bouton}
          disabled={!code.trim() || !name.trim() || !currency.trim() || submitting}
          onClick={handleCreate}
        >
          {submitting ? 'Création…' : 'Créer le pays'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les pays pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && countries.length === 0 && <p style={styles.vide}>Aucun pays enregistré.</p>}

      <div style={styles.list}>
        {countries.map((c) => (
          <div key={c.code} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>
                {c.name} ({c.code})
              </span>
              <span style={c.active ? styles.badgeActif : styles.badgeInactif}>
                {c.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <div style={styles.ligne}>Devise : {c.default_currency}</div>
            <button
              style={styles.boutonSecondaire}
              disabled={togglingCode === c.code}
              onClick={() => handleToggleActive(c)}
            >
              {togglingCode === c.code ? '…' : c.active ? 'Désactiver' : 'Réactiver'}
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
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  msgOk: { padding: 12, borderRadius: 8, background: '#E4F7EC', color: '#006B3C', fontSize: 13, marginBottom: 16 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FBE7E8', color: '#E5484D', fontSize: 13, marginBottom: 16 },
  createBox: {
    border: '1px dashed #C9C0AE', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: '#fff',
  },
  createTitre: { fontWeight: 700, fontSize: 13.5, color: '#0B2418' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #E7E1D3', fontSize: 13.5 },
  bouton: {
    padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0B2418',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  boutonSecondaire: {
    alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid #E7E1D3',
    background: '#fff', color: '#0B2418', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: '#0B2418' },
  badgeActif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#E4F7EC', color: '#006B3C',
  },
  badgeInactif: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
    background: '#F0EEE7', color: '#66756D',
  },
  ligne: { fontSize: 13, color: '#66756D' },
}
