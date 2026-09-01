import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', fontFamily: 'inherit' }}>
      <h1>Mobility OS Maroc</h1>
      <p className="muted">Pilote réel — branché sur une vraie base de données, pas une démo figée.</p>
      <div style={{ display: 'grid', gap: 16, marginTop: 32 }}>
        <Link className="btn" href="/passager" style={{ textDecoration: 'none' }}>App Passager</Link>
        <Link className="btn outline" href="/chauffeur" style={{ textDecoration: 'none' }}>App Chauffeur</Link>
        <Link className="btn ghost" href="/dashboard" style={{ textDecoration: 'none' }}>Dashboard Opérateur</Link>
      </div>
    </div>
  )
}
