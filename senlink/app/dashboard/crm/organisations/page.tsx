'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'
import { CRM_ROLE_LABELS, type MembreCrm } from '../equipe/page'

type Organisation = {
  id: string
  name: string
  type: string
  country: string | null
  responsable_user_id: string | null
  notes: string | null
  created_at: string
}

type Contact = {
  id: string
  crm_organization_id: string
  full_name: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  role_title: string | null
}

const TYPE_LABELS: Record<string, string> = {
  transporteur: 'Transporteur',
  transitaire: 'Transitaire',
  client_prospect: 'Client / prospect',
  partenaire: 'Partenaire',
  autre: 'Autre',
}

export default function CrmOrganisationsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [equipe, setEquipe] = useState<MembreCrm[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [nom, setNom] = useState('')
  const [type, setType] = useState('')
  const [pays, setPays] = useState('')
  const [responsable, setResponsable] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [nomContact, setNomContact] = useState<Record<string, string>>({})
  const [telContact, setTelContact] = useState<Record<string, string>>({})
  const [busyContact, setBusyContact] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [orgsRes, contactsRes, equipeRes] = await Promise.all([
        supabase.from('crm_organizations').select('id, name, type, country, responsable_user_id, notes, created_at').order('created_at', { ascending: false }),
        supabase.from('crm_contacts').select('id, crm_organization_id, full_name, phone, whatsapp, email, role_title'),
        supabase.rpc('admin_list_crm_team'),
      ])
      if (orgsRes.error) throw orgsRes.error
      if (contactsRes.error) throw contactsRes.error
      if (equipeRes.error) throw equipeRes.error
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

  function nomResponsable(userId: string | null) {
    if (!userId) return null
    const m = equipe.find((e) => e.user_id === userId)
    return m ? m.full_name || m.email : null
  }

  async function handleCreerOrganisation() {
    if (!nom.trim() || !type) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('crm_organizations').insert({
        name: nom.trim(),
        type,
        country: pays.trim() || null,
        responsable_user_id: responsable || null,
      })
      if (error) throw error
      setMsg({ text: `${nom.trim()} ajoutée.`, type: 'ok' })
      setNom('')
      setType('')
      setPays('')
      setResponsable('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAjouterContact(orgId: string) {
    const nomC = nomContact[orgId]?.trim()
    if (!nomC) return
    setBusyContact(orgId)
    setMsg(null)
    try {
      const { error } = await supabase.from('crm_contacts').insert({
        crm_organization_id: orgId,
        full_name: nomC,
        phone: telContact[orgId]?.trim() || null,
      })
      if (error) throw error
      setNomContact({ ...nomContact, [orgId]: '' })
      setTelContact({ ...telContact, [orgId]: '' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setBusyContact(null)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/crm" style={styles.retour}>
          ← CRM SenLink
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Organisations & contacts</h1>
        <p style={styles.soustitre}>
          Toute organisation avec laquelle l&apos;équipe SenLink est en relation — transporteur, transitaire,
          client/prospect ou partenaire — avec ses contacts.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Ajouter une organisation</div>
        <input style={shared.input} placeholder="Nom de l'organisation" value={nom} onChange={(e) => setNom(e.target.value)} />
        <select style={shared.input} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Type…</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input style={shared.input} placeholder="Pays (optionnel)" value={pays} onChange={(e) => setPays(e.target.value)} />
        <select style={shared.input} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option value="">Responsable (optionnel)…</option>
          {equipe.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email} — {CRM_ROLE_LABELS[m.crm_role]}
            </option>
          ))}
        </select>
        <button style={shared.boutonPrimaire} disabled={!nom.trim() || !type || submitting} onClick={handleCreerOrganisation}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && organisations.length === 0 && (
        <p style={styles.vide}>Aucune organisation pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {organisations.map((o) => (
          <div key={o.id} style={{ ...shared.card, ...styles.card }}>
            <div style={styles.cardTop}>
              <span style={styles.nom}>{o.name}</span>
              <span style={styles.badge}>{TYPE_LABELS[o.type] ?? o.type}</span>
            </div>
            {o.country && <div style={styles.ligne}>{o.country}</div>}
            {nomResponsable(o.responsable_user_id) && (
              <div style={styles.ligneResp}>Responsable : {nomResponsable(o.responsable_user_id)}</div>
            )}

            <div style={styles.contacts}>
              {contacts
                .filter((c) => c.crm_organization_id === o.id)
                .map((c) => (
                  <div key={c.id} style={styles.contact}>
                    {c.full_name}
                    {c.phone ? ` — ${c.phone}` : ''}
                  </div>
                ))}
            </div>

            <div style={styles.ajoutContact}>
              <input
                style={{ ...shared.input, ...styles.inputPetit }}
                placeholder="Nom du contact"
                value={nomContact[o.id] ?? ''}
                onChange={(e) => setNomContact({ ...nomContact, [o.id]: e.target.value })}
              />
              <input
                style={{ ...shared.input, ...styles.inputPetit }}
                placeholder="Téléphone"
                value={telContact[o.id] ?? ''}
                onChange={(e) => setTelContact({ ...telContact, [o.id]: e.target.value })}
              />
              <button
                style={shared.boutonSecondaire}
                disabled={!nomContact[o.id]?.trim() || busyContact === o.id}
                onClick={() => handleAjouterContact(o.id)}
              >
                {busyContact === o.id ? '…' : '+ Contact'}
              </button>
            </div>
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
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: color.inkStrong },
  ligne: { fontSize: 12.5, color: color.muted },
  ligneResp: { fontSize: 12.5, color: color.muted, fontStyle: 'italic' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
    background: color.goldTint, color: '#8A6100',
  },
  contacts: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 },
  contact: { fontSize: 12.5, color: color.ink },
  ajoutContact: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  inputPetit: { flex: '1 1 120px', padding: '8px 10px', fontSize: 12.5 },
}
