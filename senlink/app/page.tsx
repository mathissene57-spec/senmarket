'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function handleSuivi(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    router.push(`/suivi/${encodeURIComponent(code.trim())}`)
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.kicker}>Maroc ↔ Sénégal. Chaque colis. Chaque étape.</p>
        <h1 style={styles.titre}>
          La couche numérique de <span style={{ color: '#F5B800' }}>confiance</span> du
          corridor logistique Maroc–Sénégal.
        </h1>
        <p style={styles.soustitre}>
          SenLink n&apos;est ni une simple application de tracking, ni un nouveau
          transporteur : chaque étape d&apos;un colis — dépôt, contrôle, transport,
          douane, hub, point relais, livraison — génère un événement numérique
          traçable et une preuve.
        </p>

        <form onSubmit={handleSuivi} style={styles.form}>
          <input
            type="text"
            placeholder="Ex : SL-MA-SN-847291"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.bouton}>
            Suivre mon colis
          </button>
        </form>
      </section>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hero: {
    maxWidth: 720,
    padding: '80px 24px',
    textAlign: 'center',
  },
  kicker: {
    color: '#00C96B',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  titre: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(28px, 5vw, 44px)',
    fontWeight: 900,
    color: '#0A1A0F',
    lineHeight: 1.2,
    margin: '0 0 20px',
  },
  soustitre: {
    fontSize: 16,
    color: '#3D3D3D',
    lineHeight: 1.6,
    margin: '0 0 32px',
  },
  form: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  input: {
    flex: '1 1 260px',
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #D8D2C6',
    fontSize: 15,
  },
  bouton: {
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    background: '#0A1A0F',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
}
