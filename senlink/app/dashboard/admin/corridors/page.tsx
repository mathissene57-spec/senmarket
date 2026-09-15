'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Corridor = {
  id: string
  origin_country: string
  destination_country: string
  active: boolean
}

type Country = { code: string; name: string }

export default function AdminCorridorsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [corridors, setCorridors] = useState<Corridor[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [corridorsRes, countriesRes] = await Promise.all([
        supabase
          .from('corridors')
          .select('id, origin_country, destination_country, active')
          .order('origin_country'),
        supabase.from('countries').select('code, name').eq('active', true).order('name'),
      ])
      if (corridorsRes.error) throw corridorsRes.error
      if (countriesRes.error) throw countriesRes.error
      setCorridors((corridorsRes.data ?? []) as Corridor[])
      const countryRows = (countriesRes.data ?? []) as Country[]
      setCountries(countryRows)
      setOrigin((prev) => prev || countryRows[0]?.code || '')
      setDestination((prev) => prev || countryRows[1]?.code || countryRows[0]?.code || '')
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

  function countryName(code: string) {
    return countries.find((c) => c.code === code)?.name ?? code
  }

  async function handleCreate() {
    if (!origin || !destination || origin === destination) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('corridors').insert({
        origin_country: origin,
        destination_country: destination,
      })
      if (error) throw error
      setMsg({ text: 'Corridor créé.', type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(corridor: Corridor) {
    setTogglingId(corridor.id)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('corridors')
        .update({ active: !corridor.active })
        .eq('id', corridor.id)
      if (error) throw error
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
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
        <h1 style={styles.titre}>Corridors</h1>
        <p style={styles.soustitre}>
          {corridors.length} corridor(s) enregistré(s). Un pays actif ne rend pas
          automatiquement ses corridors disponibles — ils doivent être créés explicitement ici.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Créer un corridor</div>
        <select style={styles.input} value={origin} onChange={(e) => setOrigin(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select style={styles.input} value={destination} onChange={(e) => setDestination(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {origin && destination && origin === destination && (
          <p style={styles.avertissement}>Origine et destination doivent être différentes.</p>
        )}
        <button
          style={styles.bouton}
          disabled={!origin || !destination || origin === destination || submitting}
          onClick={handleCreate}
        >
          {submitting ? 'Création…' : 'Créer le corridor'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les corridors pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && corridors.length === 0 && <p style={styles.vide}>Aucun corridor enregistré.</p>}

      <div style={styles.list}>
        {corridors.map((c) => (
          <div key={c.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>
                {countryName(c.origin_country)} → {countryName(c.destination_country)}
              </span>
              <span style={c.active ? styles.badgeActif : styles.badgeInactif}>
                {c.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <button
              style={styles.boutonSecondaire}
              disabled={togglingId === c.id}
              onClick={() => handleToggleActive(c)}
            >
              {togglingId === c.id ? '…' : c.active ? 'Désactiver' : 'Réactiver'}
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
  avertissement: { fontSize: 12.5, color: '#E5484D', margin: 0 },
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
}
