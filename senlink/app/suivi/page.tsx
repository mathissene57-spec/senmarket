'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuiviIndexPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    router.push(`/suivi/${encodeURIComponent(code.trim())}`)
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.kicker}>Suivi de colis</p>
        <h1 style={styles.titre}>Où en est mon colis ?</h1>
        <p style={styles.soustitre}>
          Entrez le code de suivi reçu à la création de l&apos;envoi (format
          SL-MA-SN-xxxxxx).
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
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
  page: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hero: { maxWidth: 560, padding: '80px 24px', textAlign: 'center' },
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
    fontSize: 'clamp(26px, 4vw, 36px)',
    fontWeight: 900,
    color: '#0A1A0F',
    margin: '0 0 12px',
  },
  soustitre: { fontSize: 15, color: '#3D3D3D', lineHeight: 1.6, margin: '0 0 28px' },
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
