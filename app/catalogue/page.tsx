import { getCatalogue } from '@/lib/supabase/catalogue'

export const metadata = {
  title: 'Catalogue -- SenMarket',
}

export default async function CataloguePage() {
  let boutiques: Awaited<ReturnType<typeof getCatalogue>> = []
  let erreur: string | null = null

  try {
    boutiques = await getCatalogue()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  if (erreur) {
    return (
      <main style={styles.page}>
        <div style={styles.erreur}>
          Impossible de charger le catalogue pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Catalogue SenMarket</h1>
        <p style={styles.subtitle}>
          {boutiques.length} boutique{boutiques.length > 1 ? 's' : ''} active
          {boutiques.length > 1 ? 's' : ''}
        </p>
      </div>

      {boutiques.length === 0 && <p style={styles.vide}>Aucune boutique active pour le moment.</p>}

      {boutiques.map((boutique) => (
        <section key={boutique.id} style={styles.boutiqueSection}>
          <div style={styles.boutiqueHeader}>
            {boutique.logo_url ? (
              <img src={boutique.logo_url} alt={boutique.nom} style={styles.boutiqueLogoImg} />
            ) : (
              <div style={styles.boutiqueLogo}>{boutique.emoji ?? '🏪'}</div>
            )}
            <div>
              <h2 style={styles.boutiqueNom}>
                {boutique.nom}
                {boutique.verifie && <span title="Boutique verifiee">✅</span>}
              </h2>
              <div style={styles.boutiqueMeta}>
                {[boutique.categorie, boutique.ville].filter(Boolean).join(' · ')}
                {' — '}
                {'★'.repeat(Math.round(boutique.note))} ({boutique.note})
              </div>
            </div>
          </div>

          {boutique.produits.length === 0 ? (
            <p style={styles.vide}>Aucun produit pour l&apos;instant.</p>
          ) : (
            <div style={styles.produitsGrid}>
              {boutique.produits.map((produit) => {
                const image = produit.produit_images[0]?.url ?? produit.image_url
                const epuise = produit.stock <= 0
                return (
                  <div key={produit.id} style={styles.carteProduit}>
                    {image ? (
                      <img src={image} alt={produit.nom} style={styles.imageProduitImg} />
                    ) : (
                      <div style={styles.imageProduit}>{produit.emoji ?? '📦'}</div>
                    )}
                    <div style={styles.corpsProduit}>
                      <p style={styles.nomProduit}>{produit.nom}</p>
                      <span style={styles.prixProduit}>
                        {produit.prix} {boutique.devise}
                      </span>
                      {epuise && <div style={styles.badgeEpuise}>Épuisé</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ))}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    background: '#FAF7F2',
    color: '#1A1A1A',
    minHeight: '100vh',
    padding: '24px clamp(16px, 5vw, 64px)',
  },
  header: { marginBottom: 32, textAlign: 'center' },
  title: { fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, margin: 0 },
  subtitle: { color: '#7A7A7A', fontSize: 14, marginTop: 8 },
  boutiqueSection: {
    background: '#FFFFFF',
    border: '1px solid #E8E2D9',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  boutiqueHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 },
  boutiqueLogo: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#006B3C',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    flexShrink: 0,
  },
  boutiqueLogoImg: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  boutiqueNom: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  boutiqueMeta: { color: '#7A7A7A', fontSize: 13, marginTop: 2 },
  produitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 14,
  },
  carteProduit: {
    border: '1px solid #E8E2D9',
    borderRadius: 14,
    overflow: 'hidden',
    background: '#FFFFFF',
  },
  imageProduit: {
    width: '100%',
    aspectRatio: '1 / 1',
    background: '#F4EEE4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 40,
  },
  imageProduitImg: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    background: '#F4EEE4',
    display: 'block',
  },
  corpsProduit: { padding: '10px 12px' },
  nomProduit: { fontSize: 13, fontWeight: 700, margin: '0 0 4px', lineHeight: 1.3 },
  prixProduit: { fontSize: 14, fontWeight: 900, color: '#006B3C' },
  badgeEpuise: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(196,30,58,.85)',
    borderRadius: 6,
    padding: '2px 6px',
    marginTop: 4,
  },
  vide: { textAlign: 'center', color: '#7A7A7A', padding: 40 },
  erreur: {
    background: 'rgba(196,30,58,.08)',
    border: '1px solid rgba(196,30,58,.25)',
    borderRadius: 12,
    padding: 20,
    color: '#C41E3A',
    maxWidth: 480,
    margin: '40px auto',
  },
}
