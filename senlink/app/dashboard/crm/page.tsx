'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'
import type { MembreCrm } from '@/lib/crm'

type TacheUrgente = {
  id: string
  title: string
  priority: 'basse' | 'moyenne' | 'haute'
  due_date: string | null
  responsable_user_id: string
  crm_organization_id: string | null
}

const LIENS = [
  { label: 'Équipe', href: '/dashboard/crm/equipe', desc: 'Qui fait quoi' },
  { label: 'Organisations & contacts', href: '/dashboard/crm/organisations', desc: 'Transporteurs, transitaires, clients, partenaires' },
  { label: 'Tâches', href: '/dashboard/crm/taches', desc: 'Prochaine action, responsable, échéance' },
  { label: 'Activités', href: '/dashboard/crm/activites', desc: 'Historique des interactions' },
]

export default function CrmDashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nbOrganisations, setNbOrganisations] = useState(0)
  const [nbTachesEnCours, setNbTachesEnCours] = useState(0)
  const [nbTachesBloquees, setNbTachesBloquees] = useState(0)
  const [equipe, setEquipe] = useState<MembreCrm[]>([])
  const [tachesUrgentes, setTachesUrgentes] = useState<TacheUrgente[]>([])
  const [organisations, setOrganisations] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const aujourdHui = new Date().toISOString().slice(0, 10)
        const [orgsRes, tachesEnCoursRes, tachesBloqueesRes, equipeRes, urgentesRes] = await Promise.all([
          supabase.from('crm_organizations').select('id, name'),
          supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).in('status', ['a_faire', 'en_cours']),
          supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('status', 'bloque'),
          supabase.rpc('admin_list_crm_team'),
          supabase
            .from('crm_tasks')
            .select('id, title, priority, due_date, responsable_user_id, crm_organization_id')
            .lte('due_date', aujourdHui)
            .not('status', 'in', '(termine,annule)')
            .order('priority', { ascending: false })
            .limit(10),
        ])
        if (orgsRes.error) throw orgsRes.error
        if (tachesEnCoursRes.error) throw tachesEnCoursRes.error
        if (tachesBloqueesRes.error) throw tachesBloqueesRes.error
        if (equipeRes.error) throw equipeRes.error
        if (urgentesRes.error) throw urgentesRes.error
        setOrganisations((orgsRes.data ?? []) as { id: string; name: string }[])
        setNbOrganisations((orgsRes.data ?? []).length)
        setNbTachesEnCours(tachesEnCoursRes.count ?? 0)
        setNbTachesBloquees(tachesBloqueesRes.count ?? 0)
        setEquipe((equipeRes.data ?? []) as MembreCrm[])
        setTachesUrgentes((urgentesRes.data ?? []) as TacheUrgente[])
      } catch (e) {
        setErreur(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  function nomMembre(userId: string) {
    const m = equipe.find((e) => e.user_id === userId)
    return m ? m.full_name || m.email : '—'
  }

  function nomOrg(id: string | null) {
    if (!id) return null
    return organisations.find((o) => o.id === id)?.name ?? null
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard" style={styles.retour}>
          ← Tableau de bord
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 28, margin: '8px 0 4px' }}>CRM SenLink</h1>
        <p style={styles.soustitre}>
          Qui fait quoi, avec quel partenaire, où en est la relation, quelle est la prochaine action, qu&apos;est-ce
          qui bloque.
        </p>
      </div>

      {erreur && <div style={styles.erreur}>{erreur}</div>}

      <div style={styles.compteurs}>
        <div style={styles.compteur}>
          <span style={styles.compteurValeur}>{equipe.length}</span>
          <span style={styles.compteurLabel}>Équipe</span>
        </div>
        <div style={styles.compteur}>
          <span style={styles.compteurValeur}>{nbOrganisations}</span>
          <span style={styles.compteurLabel}>Organisations</span>
        </div>
        <div style={styles.compteur}>
          <span style={styles.compteurValeur}>{nbTachesEnCours}</span>
          <span style={styles.compteurLabel}>Tâches en cours</span>
        </div>
        <div style={{ ...styles.compteur, ...(nbTachesBloquees > 0 ? styles.compteurAlerte : {}) }}>
          <span style={styles.compteurValeur}>{nbTachesBloquees}</span>
          <span style={styles.compteurLabel}>Bloquées</span>
        </div>
      </div>

      <div style={styles.grid}>
        {LIENS.map((l) => (
          <Link key={l.href} href={l.href} style={styles.carteLink}>
            <div style={styles.carteLabel}>{l.label}</div>
            <div style={styles.carteDesc}>{l.desc}</div>
          </Link>
        ))}
      </div>

      <h2 style={styles.sousTitre}>Aujourd&apos;hui</h2>
      {loading && <p style={styles.vide}>Chargement…</p>}
      {!loading && tachesUrgentes.length === 0 && (
        <p style={styles.vide}>Rien à faire aujourd&apos;hui, ou en retard — à jour.</p>
      )}
      <div style={styles.list}>
        {tachesUrgentes.map((t) => (
          <div key={t.id} style={{ ...shared.card, ...styles.tacheCard, ...(t.priority === 'haute' ? styles.tacheUrgente : {}) }}>
            <span style={styles.tacheTitre}>{t.title}</span>
            <span style={styles.tacheMeta}>
              {nomOrg(t.crm_organization_id) && `${nomOrg(t.crm_organization_id)} · `}
              Responsable : {nomMembre(t.responsable_user_id)}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  head: { marginBottom: 20 },
  retour: { color: color.green600, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  soustitre: { color: color.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 620 },
  sousTitre: { fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 900, margin: '32px 0 12px' },
  vide: { color: color.muted, fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 14, marginBottom: 16 },
  compteurs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 24 },
  compteur: {
    padding: '14px 16px', borderRadius: 12, background: color.surface, border: `1px solid ${color.borderStrong}`,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  compteurAlerte: { borderColor: color.danger, background: color.dangerTint },
  compteurValeur: { fontSize: 24, fontWeight: 900, color: color.inkStrong, fontFamily: "'Playfair Display', serif" },
  compteurLabel: { fontSize: 11.5, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  carteLink: {
    padding: 18, borderRadius: 12, background: '#0B2418', border: '1px solid #D4A017',
    color: '#D4A017', fontWeight: 700, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 4,
  },
  carteLabel: { fontSize: 14.5 },
  carteDesc: { fontSize: 11.5, color: '#C9D6CE', fontWeight: 400 },
  list: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 },
  tacheCard: { padding: 14, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `4px solid ${color.borderStrong}` },
  tacheUrgente: { borderLeft: `4px solid ${color.danger}` },
  tacheTitre: { fontWeight: 700, fontSize: 14, color: color.inkStrong },
  tacheMeta: { fontSize: 12, color: color.muted },
}
