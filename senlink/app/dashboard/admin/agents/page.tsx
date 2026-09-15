'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, shared } from '@/lib/theme'

type Hub = { id: string; name: string }
type PickupPoint = { id: string; name: string }

type Agent = {
  user_id: string
  email: string
  full_name: string | null
  pickup_point_id: string | null
  hub_id: string | null
  created_at: string
}

export default function AdminAgentsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [hubs, setHubs] = useState<Hub[]>([])
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [agents, setAgents] = useState<Agent[]>([])

  const [email, setEmail] = useState('')
  const [pickupPointId, setPickupPointId] = useState('')
  const [hubId, setHubId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [edits, setEdits] = useState<Record<string, { pickupPointId: string; hubId: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErreur(null)
    try {
      const [hubsRes, pointsRes, agentsRes] = await Promise.all([
        supabase.from('hubs').select('id, name').eq('active', true).order('name'),
        supabase.from('pickup_points').select('id, name').eq('active', true).order('name'),
        supabase.rpc('admin_list_agent_point_relais'),
      ])
      if (hubsRes.error) throw hubsRes.error
      if (pointsRes.error) throw pointsRes.error
      if (agentsRes.error) throw agentsRes.error

      setHubs((hubsRes.data ?? []) as Hub[])
      setPoints((pointsRes.data ?? []) as PickupPoint[])
      const agentRows = (agentsRes.data ?? []) as Agent[]
      setAgents(agentRows)
      setEdits(
        Object.fromEntries(
          agentRows.map((a) => [a.user_id, { pickupPointId: a.pickup_point_id ?? '', hubId: a.hub_id ?? '' }])
        )
      )
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

  function pointName(id: string | null) {
    if (!id) return null
    return points.find((p) => p.id === id)?.name ?? null
  }

  async function handleAssign() {
    if (!email.trim() || (!pickupPointId && !hubId)) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_assign_agent_point_relais', {
        p_email: email.trim(),
        p_pickup_point_id: pickupPointId || null,
        p_hub_id: hubId || null,
      })
      if (error) throw error
      setMsg({ text: `${email.trim()} affecté(e).`, type: 'ok' })
      setEmail('')
      setPickupPointId('')
      setHubId('')
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit(agent: Agent) {
    const edit = edits[agent.user_id]
    if (!edit || (!edit.pickupPointId && !edit.hubId)) {
      setMsg({ text: 'Au moins un point relais ou un hub doit être renseigné.', type: 'err' })
      return
    }
    setSavingId(agent.user_id)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_assign_agent_point_relais', {
        p_email: agent.email,
        p_pickup_point_id: edit.pickupPointId || null,
        p_hub_id: edit.hubId || null,
      })
      if (error) throw error
      setMsg({ text: `${agent.email} mis à jour.`, type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setSavingId(null)
    }
  }

  async function handleRemove(agent: Agent) {
    setRemovingId(agent.user_id)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', agent.user_id)
        .eq('role', 'agent_point_relais')
      if (error) throw error
      setMsg({ text: `${agent.email} retiré(e) du rôle agent point relais.`, type: 'ok' })
      load()
    } catch (e) {
      setMsg({ text: messageUtilisateur(e), type: 'err' })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <main style={shared.page}>
      <div style={styles.head}>
        <Link href="/dashboard/admin" style={styles.retour}>
          ← Administration
        </Link>
        <h1 style={{ ...shared.titre, fontSize: 26, margin: '8px 0 4px' }}>Agents point relais</h1>
        <p style={styles.soustitre}>
          Affecte un compte existant à un point relais et/ou un hub. Un agent
          sans point relais ne peut rien traiter en dépôt/contrôle/retrait ;
          sans hub, il ne peut pas réceptionner les colis qui y arrivent.
        </p>
      </div>

      {msg && <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>}

      <div style={styles.createBox}>
        <div style={styles.createTitre}>Affecter un agent</div>
        <input
          style={shared.input}
          placeholder="Email du compte SenLink déjà créé"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select style={shared.input} value={pickupPointId} onChange={(e) => setPickupPointId(e.target.value)}>
          <option value="">Point relais (aucun)</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={shared.input} value={hubId} onChange={(e) => setHubId(e.target.value)}>
          <option value="">Hub (aucun)</option>
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <button
          style={shared.boutonPrimaire}
          disabled={!email.trim() || (!pickupPointId && !hubId) || submitting}
          onClick={handleAssign}
        >
          {submitting ? 'Affectation…' : 'Affecter'}
        </button>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}
      {!loading && !erreur && agents.length === 0 && (
        <p style={styles.vide}>Aucun agent point relais pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {agents.map((a) => {
          const edit = edits[a.user_id] ?? { pickupPointId: '', hubId: '' }
          return (
            <div key={a.user_id} style={{ ...shared.card, ...styles.card }}>
              <div style={styles.cardTop}>
                <span style={styles.nom}>{a.full_name || a.email}</span>
              </div>
              <div style={styles.ligne}>{a.email}</div>
              <div style={styles.ligneActuel}>
                Actuellement : {pointName(a.pickup_point_id) || '—'} · {hubName(a.hub_id) || '—'}
              </div>
              <select
                style={shared.input}
                value={edit.pickupPointId}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [a.user_id]: { ...edit, pickupPointId: e.target.value } }))
                }
              >
                <option value="">Point relais (aucun)</option>
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                style={shared.input}
                value={edit.hubId}
                onChange={(e) => setEdits((prev) => ({ ...prev, [a.user_id]: { ...edit, hubId: e.target.value } }))}
              >
                <option value="">Hub (aucun)</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <div style={styles.actions}>
                <button
                  style={shared.boutonSecondaire}
                  disabled={savingId === a.user_id}
                  onClick={() => handleSaveEdit(a)}
                >
                  {savingId === a.user_id ? '…' : 'Enregistrer'}
                </button>
                <button
                  style={styles.boutonDanger}
                  disabled={removingId === a.user_id}
                  onClick={() => handleRemove(a)}
                >
                  {removingId === a.user_id ? '…' : 'Retirer'}
                </button>
              </div>
            </div>
          )
        })}
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
  list: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 },
  card: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontWeight: 700, fontSize: 15, color: color.inkStrong },
  ligne: { fontSize: 13, color: color.muted },
  ligneActuel: { fontSize: 12.5, color: color.muted, fontStyle: 'italic' },
  actions: { display: 'flex', gap: 8 },
  boutonDanger: {
    padding: '12px 20px', borderRadius: 10, border: `1px solid ${color.danger}`,
    background: color.dangerTint, color: color.danger, fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
}
