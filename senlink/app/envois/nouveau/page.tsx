'use client'

import { messageErreur } from '@/lib/errors'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShipmentQrCode } from '@/components/ShipmentQrCode'

export default function NouvelEnvoiPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [originCity, setOriginCity] = useState('Casablanca')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [destinationCity, setDestinationCity] = useState('Dakar')
  const [category, setCategory] = useState('')
  const [weight, setWeight] = useState('')
  const [declaredValue, setDeclaredValue] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!senderName || !senderPhone || !recipientName || !recipientPhone) {
      setMsg({ text: 'Expéditeur et destinataire sont requis', type: 'err' })
      return
    }

    setLoading(true)
    setMsg(null)

    try {
      // Le colis n'a pas encore d'id au moment de l'upload — on utilise un
      // chemin aléatoire dans le bucket public 'shipment-proofs', déjà
      // utilisé pour les preuves de dépôt/contrôle plus loin dans le parcours.
      let photoUrl: string | null = null
      if (photo) {
        const ext = photo.name.split('.').pop() || 'jpg'
        const path = `${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('shipment-proofs')
          .upload(path, photo, { contentType: photo.type })
        if (uploadError) throw uploadError
        const { data: publicUrlData } = supabase.storage.from('shipment-proofs').getPublicUrl(path)
        photoUrl = publicUrlData.publicUrl
      }

      // tracking_code et qr_code_data sont générés côté base par un trigger
      // (voir supabase/migrations) : on ne les envoie jamais depuis le client,
      // on les relit juste après insertion pour afficher le QR au client.
      const { data: userData } = await supabase.auth.getUser()
      const { data: inserted, error } = await supabase
        .from('shipments')
        .insert({
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
          photo_url: photoUrl,
        })
        .select('tracking_code')
        .single()
      if (error) throw error

      setCreated(inserted.tracking_code)
      setMsg(null)
      setPhoto(null)
    } catch (e) {
      setMsg({ text: messageErreur(e), type: 'err' })
    } finally {
      setLoading(false)
    }
  }

  if (created) {
    return (
      <main style={styles.page}>
        <h1 style={styles.titre}>Envoi créé</h1>
        <div style={styles.succesBox}>
          <ShipmentQrCode value={created} size={160} />
          <div style={styles.succesCode}>{created}</div>
          <p style={styles.succesHelp}>
            Présentez ce code (ou ce QR) au point relais lors du dépôt.
            Retrouvez le suivi complet sur{' '}
            <a href={`/suivi/${created}`} style={styles.lien}>
              /suivi/{created}
            </a>
            .
          </p>
        </div>
        <button style={styles.bouton} onClick={() => setCreated(null)}>
          Créer un autre envoi
        </button>
      </main>
    )
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
          <input
            style={styles.input}
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          {photo && <div style={styles.photoNom}>{photo.name}</div>}
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
  photoNom: { fontSize: 12, color: '#6A8572' },
  succesBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: 24, borderRadius: 14, border: '1px solid #E8E2D9', marginBottom: 20,
  },
  succesCode: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 900, letterSpacing: 1 },
  succesHelp: { fontSize: 13, color: '#3D3D3D', textAlign: 'center', margin: 0, lineHeight: 1.6 },
  lien: { color: '#00875A', fontWeight: 600 },
}
