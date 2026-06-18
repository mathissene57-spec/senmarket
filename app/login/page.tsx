'use client'

export default function LoginPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Connexion</h1>
      <form action="/auth/login" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input name="email" type="email" placeholder="Email" required style={{ padding: '0.5rem' }} />
        <input name="password" type="password" placeholder="Mot de passe" required style={{ padding: '0.5rem' }} />
        <button type="submit" style={{ padding: '0.5rem', cursor: 'pointer' }}>Se connecter</button>
      </form>
    </div>
  )
}
