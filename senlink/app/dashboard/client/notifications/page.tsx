'use client'

import { messageUtilisateur } from '@/lib/errors'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Notification = {
  id: string
  shipment_id: string | null
  channel: string
  type: string
  message: string | null
  status: string
  created_at: string
}

type ShipmentOption = { id: string; tracking_code: string }

export default function NotificationsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErreur(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')

        // notifications_self_select : user_id = auth.uid() suffit.
        const [notifRes, shipmentsRes] = await Promise.all([
          supabase
            .from('notifications')
            .select('id, shipment_id, channel, type, message, status, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase.from('shipments').select('id, tracking_code').eq('client_user_id', user.id),
        ])
        if (notifRes.error) throw notifRes.error
        if (shipmentsRes.error) throw shipmentsRes.error
        setNotifications((notifRes.data ?? []) as Notification[])
        setShipments((shipmentsRes.data ?? []) as ShipmentOption[])
      } catch (e) {
        setErreur(messageUtilisateur(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  function trackingCode(id: string | null) {
    if (!id) return null
    return shipments.find((s) => s.id === id)?.tracking_code ?? null
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <Link href="/dashboard/client" style={styles.retour}>
          ← Espace client
        </Link>
        <h1 style={styles.titre}>Notifications</h1>
        <p style={styles.soustitre}>Les messages envoyés au sujet de tes colis.</p>
      </div>

      {loading && <p style={styles.vide}>Chargement…</p>}
      {erreur && (
        <div style={styles.erreur}>
          Impossible de charger tes notifications pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      )}
      {!loading && !erreur && notifications.length === 0 && (
        <p style={styles.vide}>Aucune notification pour l&apos;instant.</p>
      )}

      <div style={styles.list}>
        {notifications.map((n) => (
          <div key={n.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.type}>{n.type}</span>
              <span style={styles.date}>{new Date(n.created_at).toLocaleString('fr-FR')}</span>
            </div>
            {n.message && <div style={styles.message}>{n.message}</div>}
            <div style={styles.meta}>
              {n.channel} · {n.status}
              {trackingCode(n.shipment_id) && ` · ${trackingCode(n.shipment_id)}`}
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
  retour: { color: '#006B3C', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '8px 0 4px' },
  soustitre: { color: '#66756D', fontSize: 13.5, lineHeight: 1.6, margin: 0 },
  vide: { color: '#66756D', fontSize: 14, lineHeight: 1.6 },
  erreur: { padding: 16, borderRadius: 10, background: '#FBE7E8', color: '#E5484D', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    border: '1px solid #E7E1D3', borderRadius: 12, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontWeight: 700, fontSize: 13.5, color: '#0B2418' },
  date: { fontSize: 11, color: '#66756D' },
  message: { fontSize: 13.5, color: '#66756D' },
  meta: { fontSize: 11.5, color: '#66756D' },
}
