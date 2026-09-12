'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type PickupPoint = {
  id: string
  name: string
  city: string
  country: string
  address: string | null
  phone: string | null
  active: boolean
  hub_id: string | null
}

type Hub = { id: string; name: string }
type Country = { code: string; name: string }

export default function AdminPointsRelaisPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [hubId, setHubId] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [pointsRes, hubsRes, countriesRes] = await Promise.all([
        supabase
          .from('pickup_points')
          .select('id, name, city, country, address, phone, active, hub_id')
          .order('name'),
        supabase.from('hubs').select('id, name').eq('active', true).order('name'),
        supabase.from('countries').select('code, name').eq('active', true).order('name'),
      ])
      if (pointsRes.error) throw pointsRes.error
      if (hubsRes.error) throw hubsRes.error
      if (countriesRes.error) throw countriesRes.error
      setPoints((pointsRes.data ?? []) as PickupPoint[])
      setHubs((hubsRes.data ?? []) as Hub[])
      const countryRows = (countriesRes.data ?? []) as Country[]
      setCountries(countryRows)
      setCountry((prev) => prev || countryRows[0]?.code || '')
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

  function hubName(id: string | null) {
    if (!id) return null
    return hubs.find((h) => h.id === id)?.name ?? null
  }

  async function handleCreate() {
    if (!name.trim() || !city.trim() || !country) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('pickup_points').insert({
        name: name.trim(),
        city: city.trim(),
        country,
        hub_id: hubId || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      })
      if (error) throw error
      setMsg({ text: 'Point relais créé.', type: 'ok' })
      setName('')
      setCity('')
      setHubId('')
      setAddress('')
      setPhone('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(point: PickupPoint) {
    setTogglingId(point.id)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('pickup_points')
        .update({ active: !point.active })
        .eq('id', point.id)
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
        <h1 style={styles.titre}>Points relais</h1>
        <p style={styles.soustitre}>{points.length} point(s) relais enregistré(s).</p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Créer un point relais</div>
        <input style={styles.input} placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={styles.input} placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} />
        <select style={styles.input} value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select style={styles.input} value={hubId} onChange={(e) => setHubId(e.target.value)}>
          <option value="">Hub de rattachement (optionnel)</option>
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <input
          style={styles.input}
          placeholder="Adresse (optionnelle)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Téléphone (optionnel)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          style={styles.bouton}
          disabled={!name.trim() || !city.trim() || !country || submitting}
          onClick={handleCreate}
        >
          {submitting ? 'Création…' : 'Créer le point relais'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger les points relais pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && points.length === 0 && (
        <p style={styles.vide}>Aucun point relais enregistré.</p>
      )}

      <div style={styles.list}>
        {points.map((p) => (
          <div key={p.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{p.name}</span>
              <span style={p.active ? styles.badgeActif : styles.badgeInactif}>
                {p.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <div style={styles.ligne}>
              {p.city}, {p.country}
            </div>
            {hubName(p.hub_id) && <div style={styles.ligne}>Hub : {hubName(p.hub_id)}</div>}
            {p.phone && <div style={styles.ligne}>{p.phone}</div>}
            <button
              style={styles.boutonSecondaire}
              disabled={togglingId === p.id}
              onClick={() => handleToggleActive(p)}
            >
              {togglingId === p.id ? '…' : p.active ? 'Désactiver' : 'Réactiver'}
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
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
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
