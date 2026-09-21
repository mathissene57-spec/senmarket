'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'
import type { MembreCrm } from '../equipe/page'

type Activite = {
  id: string
  crm_organization_id: string | null
  crm_contact_id: string | null
  user_id: string
  type: string
  result_text: string | null
  next_action_text: string | null
  next_action_date: string | null
  created_at: string
}

type Organisation = { id: string; name: string }
type Contact = { id: string; crm_organization_id: string; full_name: string }

const TYPE_LABELS: Record<string, string> = {
  appel: 'Appel',
  whatsapp: 'WhatsApp',
  email: 'Email',
  rencontre: 'Rencontre',
  visite_terrain: 'Visite terrain',
  reunion: 'Réunion',
  demonstration: 'Démonstration',
  test: 'Test',
  note_interne: 'Note interne',
}

export default function CrmActivitesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [activites, setActivites] = useState<Activite[]>([])
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [equipe, setEquipe] = useState<MembreCrm[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [orgId, setOrgId] = useState('')
  const [contactId, setContactId] = useState('')
  const [type, setType] = useState('')
  const [resultat, setResultat] = useState('')
  const [prochaineAction, setProchaineAction] = useState('')
  const [dateRelance, setDateRelance] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [activitesRes, orgsRes, contactsRes, equipeRes] = await Promise.all([
        supabase
          .from('crm_activities')
          .select('id, crm_organization_id, crm_contact_id, user_id, type, result_text, next_action_text, next_action_date, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('crm_organizations').select('id, name'),
        supabase.from('crm_contacts').select('id, crm_organization_id, full_name'),
        supabase.rpc('admin_list_crm_team'),
      ])
      if (activitesRes.error) throw activitesRes.error
      if (orgsRes.error) throw orgsRes.error
      if (contactsRes.error) throw contactsRes.error
      if (equipeRes.error) throw equipeRes.error
      setActivites((activitesRes.data ?? []) as Activite[])
      setOrganisations((orgsRes.data ?? []) as Organisation[])
      setContacts((contactsRes.data ?? []) as Contact[])
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

  function nomContact(id: string | null) {
    if (!id) return null
    return contacts.find((c) => c.id === id)?.full_name ?? null
  }

  function nomAuteur(userId: string) {
    const m = equipe.find((e) => e.user_id === userId)
    return m ? m.full_name || m.email : '—'
  }

  async function handleCreer() {
    if (!type) return
    setSubmitting(true)
    setMsg(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const { error } = await supabase.from('crm_activities').insert({
        crm_organization_id: orgId || null,
        crm_contact_id: contactId || null,
        user_id: user.id,
        type,
        result_text: resultat.trim() || null,
        next_action_text: prochaineAction.trim() || null,
        next_action_date: dateRelance || null,
      })
      if (error) throw error
      setMsg({ text: 'Activité enregistrée.', type: 'ok' })
      setOrgId('')
      setContactId('')
      setType('')
      setResultat('')
      setProchaineAction('')
      setDateRelance('')
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
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Activités</h1>
        <p style={styles.soustitre}>Chaque interaction avec une organisation ou un contact, avec la prochaine action.</p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Nouvelle activité</div>
        <select style={shared.input} value={orgId} onChange={(e) => { setOrgId(e.target.value); setContactId('') }}>
          <option value="">Organisation (optionnel)…</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {orgId && (
          <select style={shared.input} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Contact (optionnel)…</option>
            {contacts
              .filter((c) => c.crm_organization_id === orgId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
          </select>
        )}
        <select style={shared.input} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Type…</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input style={shared.input} placeholder="Résultat" value={resultat} onChange={(e) => setResultat(e.target.value)} />
        <input
          style={shared.input}
          placeholder="Prochaine action (optionnel)"
          value={prochaineAction}
          onChange={(e) => setProchaineAction(e.target.value)}
        />
        <input style={shared.input} type="date" value={dateRelance} onChange={(e) => setDateRelance(e.target.value)} />
        <button style={shared.boutonPrimaire} disabled={!type || submitting} onClick={handleCreer}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && activites.length === 0 && <p style={styles.vide}>Aucune activité pour l&apos;instant.</p>}

      <div style={styles.list}>
        {activites.map((a) => (
          <div key={a.id} style={{ ...shared.card, ...styles.card }}>
            <div style={styles.cardTop}>
              <span style={styles.badge}>{TYPE_LABELS[a.type] ?? a.type}</span>
              <span style={styles.date}>{new Date(a.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <div style={styles.ligne}>
              {[nomOrg(a.crm_organization_id), nomContact(a.crm_contact_id)].filter(Boolean).join(' — ') || 'Sans organisation liée'}
              {' · '}
              {nomAuteur(a.user_id)}
            </div>
            {a.result_text && <div style={styles.resultat}>{a.result_text}</div>}
            {a.next_action_text && (
              <div style={styles.prochaineAction}>
                Prochaine action : {a.next_action_text}
                {a.next_action_date && ` (${new Date(a.next_action_date).toLocaleDateString('fr-FR')})`}
              </div>
            )}
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
  card: { padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
    background: color.goldTint, color: '#8A6100',
  },
  date: { fontSize: 11, color: color.muted },
  ligne: { fontSize: 12.5, color: color.muted },
  resultat: { fontSize: 13, color: color.ink },
  prochaineAction: { fontSize: 12.5, color: color.green600, fontStyle: 'italic' },
}
