export default function HomePage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Bienvenue sur SenMarket</h1>
      <p>La plateforme de référence.</p>
      <a 
        href="/login" 
        style={{ 
          marginTop: '20px', 
          padding: '10px 20px', 
          backgroundColor: '#0070f3', 
          color: 'white', 
          borderRadius: '5px', 
          textDecoration: 'none' 
        }}
      >
        Se connecter
      </a>
    </main>
  );
}
