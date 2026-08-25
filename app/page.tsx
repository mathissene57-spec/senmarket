export default function HomePage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Bienvenue sur SenMarket</h1>
      <p>La plateforme de référence.</p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <a
          href="/catalogue"
          style={{
            padding: '10px 20px',
            backgroundColor: '#006B3C',
            color: 'white',
            borderRadius: '5px',
            textDecoration: 'none',
          }}
        >
          Voir le catalogue
        </a>
        <a
          href="/login"
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            borderRadius: '5px',
            textDecoration: 'none',
          }}
        >
          Se connecter
        </a>
      </div>
    </main>
  );
}
