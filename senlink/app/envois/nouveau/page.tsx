'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NouvelEnvoiPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [originCity, setOriginCity] = useState('Casablanca')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [destinationCity, setDestinationCity] = useState('Dakar')
  const [category, setCategory] = useState('')
  const [weight, setWeight] = useState('')
  const [declaredValue, setDeclaredValue] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!senderName || !senderPhone || !recipientName || !recipientPhone) {
      setMsg({ text: 'Expéditeur et destinataire sont requis', type: 'err' })
      return
    }

    setLoading(true)
    setMsg(null)

    // tracking_code et qr_code_data sont générés côté base par un trigger
    // (voir supabase/migrations) : on ne les envoie jamais depuis le client.
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('shipments').insert({
      client_user_id: userData.user?.id ?? null,
      created_by: userData.user?.id ?? null,
      sender_name: senderName,
      sender_phone: senderPhone,
      origin_city: originCity,
      origin_country: 'MA',
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      destination_city: destinationCity,
      destination_country: 'SN',
      category: category || null,
      weight_declared_kg: weight ? Number(weight) : null,
      declared_value: declaredValue ? Number(declaredValue) : null,
    })

    setLoading(false)

    if (error) {
      setMsg({ text: error.message, type: 'err' })
      return
    }

    setMsg({ text: 'Envoi créé ! Vous recevrez le code de suivi par notification.', type: 'ok' })
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Créer un envoi</h1>
      <p style={styles.soustitre}>
        Casablanca → Dakar — pilote contrôlé (voir docs/blueprint.md).
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Expéditeur</legend>
          <input
            style={styles.input}
            placeholder="Nom complet"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Téléphone"
            value={senderPhone}
            onChange={(e) => setSenderPhone(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Ville de départ"
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
          />
        </fieldset>

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Destinataire</legend>
          <input
            style={styles.input}
            placeholder="Nom complet"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Téléphone"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Ville d'arrivée"
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
          />
        </fieldset>

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Colis</legend>
          <input
            style={styles.input}
            placeholder="Catégorie"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            style={styles.input}
            type="number"
            placeholder="Poids déclaré (kg)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <input
            style={styles.input}
            type="number"
            placeholder="Valeur déclarée"
            value={declaredValue}
            onChange={(e) => setDeclaredValue(e.target.value)}
          />
          {/* TODO: pas de vraie prise de photo ni d'upload vers Supabase
              Storage dans ce scaffold — bucket 'shipment-photos' à créer et
              à câbler plus tard (voir README "Hors périmètre"). */}
          <input style={styles.input} type="file" accept="image/*" disabled />
        </fieldset>

        <button style={styles.bouton} type="submit" disabled={loading}>
          {loading ? 'Création...' : 'Créer l’envoi'}
        </button>

        {msg && (
          <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</div>
        )}
      </form>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 560, margin: '0 auto', padding: '48px 24px' },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, margin: '0 0 4px' },
  soustitre: { color: '#3D3D3D', fontSize: 14, margin: '0 0 32px' },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  fieldset: { border: '1px solid #E8E2D9', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  legend: { fontSize: 13, fontWeight: 700, color: '#0A1A0F', padding: '0 6px' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #D8D2C6', fontSize: 14 },
  bouton: {
    padding: '14px 24px', borderRadius: 10, border: 'none', background: '#0A1A0F',
    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  msgOk: { padding: 12, borderRadius: 8, background: '#EAFBF2', color: '#00875A', fontSize: 13 },
  msgErr: { padding: 12, borderRadius: 8, background: '#FFF3F3', color: '#C41E3A', fontSize: 13 },
}
