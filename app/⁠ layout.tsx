export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form action="/auth/login" method="post" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h1>Connexion</h1>
        <input name="email" placeholder="Email" type="email" required />
        <input name="password" type="password" placeholder="Mot de passe" required />
        <button type="submit">Se connecter</button>
      </form>
    </div>
  );
}
