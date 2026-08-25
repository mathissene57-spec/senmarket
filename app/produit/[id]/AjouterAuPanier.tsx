'use client'

import { useState } from 'react'
import { usePanier } from '@/lib/panier/PanierProvider'

type Props = {
  produitId: string
  boutiqueId: string
  boutiqueNom: string
  devise: string
  nom: string
  prix: number
  image: string | null
  emoji: string | null
  stock: number
}

export function AjouterAuPanier(props: Props) {
  const { ajouter, ajouterEnRemplacant } = usePanier()
  const [quantite, setQuantite] = useState(1)
  const [conflit, setConflit] = useState<string | null>(null)
  const [ajoute, setAjoute] = useState(false)

  const epuise = props.stock <= 0

  function tenterAjout() {
    const resultat = ajouter(
      {
        produitId: props.produitId,
        boutiqueId: props.boutiqueId,
        boutiqueNom: props.boutiqueNom,
        devise: props.devise,
        nom: props.nom,
        prix: props.prix,
        image: props.image,
        emoji: props.emoji,
        stockDisponible: props.stock,
      },
      quantite
    )

    if (!resultat.ok) {
      setConflit(resultat.boutiqueActuelle)
      return
    }

    setConflit(null)
    setAjoute(true)
    setTimeout(() => setAjoute(false), 2000)
  }

  function remplacerEtAjouter() {
    ajouterEnRemplacant(
      {
        produitId: props.produitId,
        boutiqueId: props.boutiqueId,
        boutiqueNom: props.boutiqueNom,
        devise: props.devise,
        nom: props.nom,
        prix: props.prix,
        image: props.image,
        emoji: props.emoji,
        stockDisponible: props.stock,
      },
      quantite
    )
    setConflit(null)
    setAjoute(true)
    setTimeout(() => setAjoute(false), 2000)
  }

  if (epuise) {
    return <div style={styles.epuiseMsg}>Ce produit est actuellement épuisé.</div>
  }

  return (
    <div style={styles.zone}>
      <div style={styles.stepper}>
        <button
          type="button"
          onClick={() => setQuantite((q) => Math.max(1, q - 1))}
          style={styles.stepperBtn}
          aria-label="Diminuer la quantité"
        >
          −
        </button>
        <span style={styles.stepperVal}>{quantite}</span>
        <button
          type="button"
          onClick={() => setQuantite((q) => Math.min(props.stock, q + 1))}
          style={styles.stepperBtn}
          aria-label="Augmenter la quantité"
        >
          +
        </button>
      </div>

      <button type="button" onClick={tenterAjout} style={styles.btnAjouter}>
        {ajoute ? 'Ajouté ✓' : 'Ajouter au panier'}
      </button>

      {conflit && (
        <div style={styles.conflitBox}>
          <p style={styles.conflitTexte}>
            Votre panier contient déjà des articles de <strong>{conflit}</strong>. Le panier ne peut
            contenir qu&apos;une seule boutique à la fois.
          </p>
          <button type="button" onClick={remplacerEtAjouter} style={styles.btnRemplacer}>
            Vider le panier et ajouter cet article
          </button>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  zone: { display: 'flex', flexDirection: 'column', gap: 10 },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#F4EEE4',
    borderRadius: 10,
    padding: '6px 10px',
    width: 'fit-content',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    background: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  stepperVal: { fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' },
  btnAjouter: {
    padding: '14px 20px',
    borderRadius: 12,
    background: '#006B3C',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
  epuiseMsg: {
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(196,30,58,.08)',
    color: '#C41E3A',
    fontSize: 14,
    fontWeight: 600,
  },
  conflitBox: {
    padding: 14,
    borderRadius: 10,
    background: 'rgba(212,160,23,.1)',
    border: '1px solid rgba(212,160,23,.3)',
  },
  conflitTexte: { fontSize: 13, margin: '0 0 10px', color: '#3D3D3D' },
  btnRemplacer: {
    padding: '10px 14px',
    borderRadius: 8,
    background: '#D4A017',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
}
