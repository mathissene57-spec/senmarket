'use client'

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

export default function AdminTransporteursPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [transporteurs, setTransporteurs] = useState<Transporter[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const { data, error } = await supabase
          .from('transporters')
          .select('id, name, country_scope, trust_score, active')
          .order('name')
        if (error) throw error
        setTransporteurs((data ?? []) as Transporter[])
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

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
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    border: '1px solid #E8E2D9', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
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
