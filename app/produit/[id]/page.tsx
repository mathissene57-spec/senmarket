import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getProduit } from '@/lib/supabase/catalogue'
import { AjouterAuPanier } from './AjouterAuPanier'

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const produit = await getProduit(params.id)
    return {
      title: produit ? `${produit.nom} — SenMarket` : 'Produit introuvable — SenMarket',
    }
  } catch {
    return { title: 'SenMarket' }
  }
}

export default async function ProduitPage({ params }: { params: { id: string } }) {
  let produit: Awaited<ReturnType<typeof getProduit>> = null
  let erreur: string | null = null

  try {
    produit = await getProduit(params.id)
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  if (erreur) {
    return (
      <main style={styles.page}>
        <div style={styles.erreur}>
          Impossible de charger ce produit pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      </main>
    )
  }

  if (!produit) {
    notFound()
  }

  const images =
    produit.produit_images.length > 0
      ? produit.produit_images
      : produit.image_url
        ? [{ id: 'principale', url: produit.image_url, ordre: 0 }]
        : []
  const epuise = produit.stock <= 0

  return (
    <main style={styles.page}>
      <Link href="/catalogue" style={styles.retour}>
        ← Retour au catalogue
      </Link>

      <div style={styles.carte}>
        <div style={styles.galerie}>
          {images.length > 0 ? (
            images.map((img) => <img key={img.id} src={img.url} alt={produit.nom} style={styles.image} />)
          ) : (
            <div style={styles.imagePlaceholder}>{produit.emoji ?? '📦'}</div>
          )}
        </div>

        <div style={styles.infos}>
          <h1 style={styles.nom}>{produit.nom}</h1>
          <p style={styles.boutiqueLigne}>
            Vendu par <strong>{produit.boutique.nom}</strong>
            {produit.boutique.verifie && ' ✅'}
          </p>

          {produit.prixPromo != null ? (
            <div style={styles.prix}>
              <span style={styles.prixBarre}>
                {produit.prix} {produit.boutique.devise}
              </span>{' '}
              {produit.prixPromo} {produit.boutique.devise}
            </div>
          ) : (
            <div style={styles.prix}>
              {produit.prix} {produit.boutique.devise}
            </div>
          )}

          {epuise ? (
            <div style={styles.badgeEpuise}>Épuisé</div>
          ) : (
            <div style={styles.stock}>{produit.stock} en stock</div>
          )}

          {/* prix plein volontairement, pas prixPromo : creer_commande_complete
              recalcule prix_unitaire depuis produits.prix cote serveur et ne
              consulte jamais la table promotions -- afficher le prix reduit
              ici promettrait une remise que la commande ne tiendra pas. */}
          <AjouterAuPanier
            produitId={produit.id}
            boutiqueId={produit.boutique.id}
            boutiqueNom={produit.boutique.nom}
            boutiqueWhatsapp={produit.boutique.whatsapp}
            devise={produit.boutique.devise}
            nom={produit.nom}
            prix={produit.prix}
            image={images[0]?.url ?? null}
            emoji={produit.emoji}
            stock={produit.stock}
          />

          {produit.description && <p style={styles.description}>{produit.description}</p>}

          {produit.livraison && <p style={styles.livraison}>🚚 Livraison disponible</p>}

          {produit.boutique.ville && (
            <p style={styles.boutiqueMeta}>
              {[produit.boutique.categorie, produit.boutique.ville].filter(Boolean).join(' · ')}
              {' — '}
              {'★'.repeat(Math.round(produit.boutique.note))} ({produit.boutique.note})
            </p>
          )}
        </div>
      </div>
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
  retour: {
    display: 'inline-block',
    marginBottom: 20,
    color: '#006B3C',
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
  },
  carte: {
    background: '#FFFFFF',
    border: '1px solid #E8E2D9',
    borderRadius: 18,
    padding: 20,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 24,
    maxWidth: 900,
    margin: '0 auto',
  },
  galerie: { display: 'flex', flexDirection: 'column', gap: 10 },
  image: { width: '100%', borderRadius: 12, objectFit: 'cover', aspectRatio: '1 / 1' },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 12,
    background: '#F4EEE4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 64,
  },
  infos: { display: 'flex', flexDirection: 'column', gap: 10 },
  nom: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, margin: 0 },
  boutiqueLigne: { color: '#7A7A7A', fontSize: 14, margin: 0 },
  prix: { fontSize: 26, fontWeight: 900, color: '#006B3C' },
  prixBarre: { textDecoration: 'line-through', color: '#7A7A7A', fontWeight: 400, fontSize: 15 },
  badgeEpuise: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(196,30,58,.85)',
    borderRadius: 8,
    padding: '4px 10px',
  },
  stock: { fontSize: 13, color: '#7A7A7A' },
  description: { fontSize: 14, lineHeight: 1.6, color: '#3D3D3D' },
  livraison: { fontSize: 13, color: '#3D3D3D' },
  boutiqueMeta: { fontSize: 13, color: '#7A7A7A', marginTop: 'auto' },
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
