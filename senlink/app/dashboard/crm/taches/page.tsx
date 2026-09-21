'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'
import { CRM_ROLE_LABELS, type MembreCrm } from '@/lib/crm'

type Tache = {
  id: string
  title: string
  crm_organization_id: string | null
  responsable_user_id: string
  type: string | null
  priority: 'basse' | 'moyenne' | 'haute'
  due_date: string | null
  status: 'a_faire' | 'en_cours' | 'bloque' | 'termine' | 'annule'
  notes: string | null
}

type Organisation = { id: string; name: string }

const STATUS_LABELS: Record<Tache['status'], string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  bloque: 'Bloqué',
  termine: 'Terminé',
  annule: 'Annulé',
}

const PRIORITY_LABELS: Record<Tache['priority'], string> = {
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
}

export default function CrmTachesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [taches, setTaches] = useState<Tache[]>([])
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [equipe, setEquipe] = useState<MembreCrm[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [titre, setTitre] = useState('')
  const [orgId, setOrgId] = useState('')
  const [responsable, setResponsable] = useState('')
  const [priorite, setPriorite] = useState<Tache['priority']>('moyenne')
  const [echeance, setEcheance] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [tachesRes, orgsRes, equipeRes] = await Promise.all([
        supabase
          .from('crm_tasks')
          .select('id, title, crm_organization_id, responsable_user_id, type, priority, due_date, status, notes')
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('crm_organizations').select('id, name'),
        supabase.rpc('admin_list_crm_team'),
      ])
      if (tachesRes.error) throw tachesRes.error
      if (orgsRes.error) throw orgsRes.error
      if (equipeRes.error) throw equipeRes.error
      setTaches((tachesRes.data ?? []) as Tache[])
      setOrganisations((orgsRes.data ?? []) as Organisation[])
      setEquipe((equipeRes.data ?? []) as MembreCrm[])
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

  function nomOrg(id: string | null) {
    if (!id) return null
    return organisations.find((o) => o.id === id)?.name ?? null
  }

  function nomResponsable(userId: string) {
    const m = equipe.find((e) => e.user_id === userId)
    return m ? m.full_name || m.email : '—'
  }

  async function handleCreer() {
    if (!titre.trim() || !responsable) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('crm_tasks').insert({
        title: titre.trim(),
        crm_organization_id: orgId || null,
        responsable_user_id: responsable,
        priority: priorite,
        due_date: echeance || null,
      })
      if (error) throw error
      setMsg({ text: `Tâche "${titre.trim()}" créée.`, type: 'ok' })
      setTitre('')
      setOrgId('')
      setResponsable('')
      setPriorite('moyenne')
      setEcheance('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleChangerStatut(t: Tache, statut: Tache['status']) {
    setBusy(t.id)
    setMsg(null)
    try {
      const { error } = await supabase.from('crm_tasks').update({ status: statut }).eq('id', t.id)
      if (error) throw error
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/crm" style={styles.retour}>
          ← CRM SenLink
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Tâches</h1>
        <p style={styles.soustitre}>Chaque tâche a un seul responsable et, si utile, une organisation liée.</p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Nouvelle tâche</div>
        <input style={shared.input} placeholder="Titre (ex. Appeler ABC Transport)" value={titre} onChange={(e) => setTitre(e.target.value)} />
        <select style={shared.input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">Organisation (optionnel)…</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select style={shared.input} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option value="">Responsable…</option>
          {equipe.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email} — {CRM_ROLE_LABELS[m.crm_role]}
            </option>
          ))}
        </select>
        <select style={shared.input} value={priorite} onChange={(e) => setPriorite(e.target.value as Tache['priority'])}>
          {(Object.keys(PRIORITY_LABELS) as Tache['priority'][]).map((p) => (
            <option key={p} value={p}>
              Priorité : {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <input style={shared.input} type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        <button style={shared.boutonPrimaire} disabled={!titre.trim() || !responsable || submitting} onClick={handleCreer}>
          {submitting ? 'Création…' : 'Créer la tâche'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && taches.length === 0 && <p style={styles.vide}>Aucune tâche pour l&apos;instant.</p>}

      <div style={styles.list}>
        {taches.map((t) => (
          <div key={t.id} style={{ ...shared.card, ...styles.card }}>
            <div style={styles.cardTop}>
              <span style={styles.titreTache}>{t.title}</span>
              <span style={{ ...styles.badgePriorite, ...(t.priority === 'haute' ? styles.badgeHaute : {}) }}>
                {PRIORITY_LABELS[t.priority]}
              </span>
            </div>
            <div style={styles.ligne}>
              {nomOrg(t.crm_organization_id) && `${nomOrg(t.crm_organization_id)} · `}
              Responsable : {nomResponsable(t.responsable_user_id)}
              {t.due_date && ` · Échéance : ${new Date(t.due_date).toLocaleDateString('fr-FR')}`}
            </div>
            <select
              style={shared.input}
              value={t.status}
              disabled={busy === t.id}
              onChange={(e) => handleChangerStatut(t, e.target.value as Tache['status'])}
            >
              {(Object.keys(STATUS_LABELS) as Tache['status'][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
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
  list: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 },
  card: { padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  titreTache: { fontWeight: 700, fontSize: 14.5, color: color.inkStrong },
  ligne: { fontSize: 12.5, color: color.muted },
  badgePriorite: {
    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
    background: color.greenTint, color: color.green600, whiteSpace: 'nowrap',
  },
  badgeHaute: { background: color.dangerTint, color: color.danger },
}
