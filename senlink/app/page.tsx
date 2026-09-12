'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CorridorVisual } from '@/components/CorridorVisual'
import { color, shared } from '@/lib/theme'

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
      <section className="sl-fade-in" style={styles.hero}>
        <p style={styles.kicker}>Maroc ↔ Sénégal · Chaque colis, chaque étape</p>
        <h1 style={styles.titre}>
          La couche numérique de <span style={{ color: color.gold }}>confiance</span> du
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
            style={{ ...shared.input, flex: '1 1 260px', fontSize: 15, padding: '13px 16px' }}
          />
          <button type="submit" style={{ ...shared.boutonPrimaire, padding: '13px 26px', fontSize: 15 }}>
            Suivre mon colis
          </button>
        </form>
      </section>

      <div className="sl-fade-in" style={styles.corridorWrap}>
        <CorridorVisual />
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 980, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) clamp(16px, 4vw, 24px) 64px' },
  hero: { maxWidth: 720, margin: '0 auto', textAlign: 'center', marginBottom: 56 },
  kicker: {
    color: color.green600,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  titre: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(28px, 5vw, 46px)',
    fontWeight: 900,
    color: color.inkStrong,
    lineHeight: 1.2,
    letterSpacing: -0.5,
    margin: '0 0 20px',
  },
  soustitre: {
    fontSize: 16,
    color: color.muted,
    lineHeight: 1.65,
    margin: '0 0 32px',
  },
  form: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  corridorWrap: { maxWidth: 720, margin: '0 auto' },
}
