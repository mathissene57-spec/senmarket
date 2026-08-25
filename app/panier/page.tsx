'use client'

import Link from 'next/link'
import { usePanier } from '@/lib/panier/PanierProvider'

export default function PanierPage() {
  const { items, boutiqueId, total, modifierQuantite, retirer, vider } = usePanier()

  if (items.length === 0) {
    return (
      <main style={styles.page}>
        <h1 style={styles.titre}>Votre panier</h1>
        <p style={styles.vide}>Votre panier est vide.</p>
        <Link href="/catalogue" style={styles.lienCatalogue}>
          Voir le catalogue
        </Link>
      </main>
    )
  }

  const devise = items[0].devise
  const boutiqueNom = items[0].boutiqueNom

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Votre panier</h1>
      <p style={styles.sousTitre}>Boutique : {boutiqueNom}</p>

      <div style={styles.liste}>
        {items.map((item) => (
          <div key={item.produitId} style={styles.ligne}>
            {item.image ? (
              <img src={item.image} alt={item.nom} style={styles.image} />
            ) : (
              <div style={styles.imagePlaceholder}>{item.emoji ?? '📦'}</div>
            )}

            <div style={styles.infos}>
              <p style={styles.nom}>{item.nom}</p>
              <p style={styles.prixUnitaire}>
                {item.prix} {item.devise}
              </p>
            </div>

            <div style={styles.stepper}>
              <button
                type="button"
                onClick={() => modifierQuantite(item.produitId, -1)}
                style={styles.stepperBtn}
                aria-label="Diminuer la quantité"
              >
                −
              </button>
              <span style={styles.stepperVal}>{item.quantite}</span>
              <button
                type="button"
                onClick={() => modifierQuantite(item.produitId, 1)}
                style={styles.stepperBtn}
                aria-label="Augmenter la quantité"
                disabled={item.quantite >= item.stockDisponible}
              >
                +
              </button>
            </div>

            <div style={styles.sousTotal}>
              {item.prix * item.quantite} {item.devise}
            </div>

            <button
              type="button"
              onClick={() => retirer(item.produitId)}
              style={styles.btnRetirer}
              aria-label={`Retirer ${item.nom} du panier`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={styles.pied}>
        <button type="button" onClick={vider} style={styles.btnVider}>
          Vider le panier
        </button>
        <div style={styles.total}>
          Total : <strong>{total} {devise}</strong>
        </div>
      </div>

      <button type="button" style={styles.btnCommander} disabled>
        Passer commande (bientôt disponible)
      </button>
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
    maxWidth: 720,
    margin: '0 auto',
  },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, margin: '0 0 4px' },
  sousTitre: { color: '#7A7A7A', fontSize: 14, marginBottom: 20 },
  vide: { color: '#7A7A7A', margin: '20px 0' },
  lienCatalogue: { color: '#006B3C', fontWeight: 700, textDecoration: 'none' },
  liste: { display: 'flex', flexDirection: 'column', gap: 12 },
  ligne: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#FFFFFF',
    border: '1px solid #E8E2D9',
    borderRadius: 12,
    padding: 12,
  },
  image: { width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 },
  imagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    background: '#F4EEE4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    flexShrink: 0,
  },
  infos: { flex: 1, minWidth: 0 },
  nom: { fontSize: 14, fontWeight: 700, margin: '0 0 2px' },
  prixUnitaire: { fontSize: 13, color: '#7A7A7A', margin: 0 },
  stepper: { display: 'flex', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: '1px solid #E8E2D9',
    background: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  stepperVal: { fontSize: 14, fontWeight: 700, minWidth: 16, textAlign: 'center' },
  sousTotal: { fontSize: 14, fontWeight: 900, color: '#006B3C', minWidth: 80, textAlign: 'right' },
  btnRetirer: {
    border: 'none',
    background: 'transparent',
    color: '#C41E3A',
    fontSize: 16,
    cursor: 'pointer',
  },
  pied: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid #E8E2D9',
  },
  btnVider: {
    border: 'none',
    background: 'transparent',
    color: '#7A7A7A',
    fontSize: 13,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  total: { fontSize: 16 },
  btnCommander: {
    width: '100%',
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    background: '#C7C0B4',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'not-allowed',
  },
}
