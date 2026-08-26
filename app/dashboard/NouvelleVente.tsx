'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ProduitVendeur } from '@/lib/supabase/dashboard'

type LigneCatalogue = {
  type: 'catalogue'
  produitId: string
  nom: string
  prixUnitaire: number
  quantite: number
  stockDisponible: number
}

type LigneLibre = {
  type: 'libre'
  cle: string
  nom: string
  prixUnitaire: number
  quantite: number
}

type LignePanier = LigneCatalogue | LigneLibre

const MODES_PAIEMENT = [
  { valeur: 'espece', label: 'Espèces' },
  { valeur: 'wave', label: 'Wave' },
  { valeur: 'orange_money', label: 'Orange Money' },
  { valeur: 'carte', label: 'Carte' },
  { valeur: 'autre', label: 'Autre' },
]

const MESSAGES_ERREUR: { [code: string]: string } = {
  PANIER_VIDE: 'Le panier est vide.',
  BOUTIQUE_NON_AUTORISEE: "Vous n'êtes pas autorisé à vendre pour cette boutique.",
  QUANTITE_INVALIDE: 'Une des quantités est invalide.',
  PRODUIT_INTROUVABLE: "Un des produits sélectionnés n'existe plus dans le catalogue.",
  STOCK_INSUFFISANT: 'Stock insuffisant pour un des produits.',
  DESIGNATION_VIDE: "La désignation d'un article libre ne peut pas être vide.",
  PRIX_INVALIDE: "Le prix d'un article libre est invalide.",
}

function messageErreur(erreur: unknown): string {
  const brut = erreur instanceof Error ? erreur.message : String(erreur)
  for (const code of Object.keys(MESSAGES_ERREUR)) {
    if (brut.includes(code)) return MESSAGES_ERREUR[code]
  }
  return brut || 'Erreur inconnue lors de la création de la vente.'
}

export function NouvelleVente({
  boutiqueId,
  devise,
  produits,
}: {
  boutiqueId: string
  devise: string
  produits: ProduitVendeur[]
}) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [produitChoisi, setProduitChoisi] = useState('')
  const [quantiteProduit, setQuantiteProduit] = useState(1)

  const [afficherFormLibre, setAfficherFormLibre] = useState(false)
  const [nomLibre, setNomLibre] = useState('')
  const [prixLibre, setPrixLibre] = useState('')
  const [quantiteLibre, setQuantiteLibre] = useState(1)

  const [clientNom, setClientNom] = useState('')
  const [clientTelephone, setClientTelephone] = useState('')
  const [modePaiement, setModePaiement] = useState('espece')
  const [notes, setNotes] = useState('')

  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  const produitsVendables = produits.filter((p) => p.actif && p.stock > 0)
  const total = panier.reduce((s, l) => s + l.prixUnitaire * l.quantite, 0)

  function ajouterProduitCatalogue() {
    const produit = produitsVendables.find((p) => p.id === produitChoisi)
    if (!produit || quantiteProduit < 1) return

    setPanier((prev) => {
      const existant = prev.find((l): l is LigneCatalogue => l.type === 'catalogue' && l.produitId === produit.id)
      if (existant) {
        return prev.map((l) =>
          l === existant ? { ...existant, quantite: existant.quantite + quantiteProduit } : l
        )
      }
      return [
        ...prev,
        {
          type: 'catalogue',
          produitId: produit.id,
          nom: produit.nom,
          prixUnitaire: produit.prix,
          quantite: quantiteProduit,
          stockDisponible: produit.stock,
        },
      ]
    })
    setProduitChoisi('')
    setQuantiteProduit(1)
  }

  function ajouterArticleLibre() {
    const nom = nomLibre.trim()
    const prix = Number(prixLibre)
    if (!nom || !Number.isFinite(prix) || prix < 0 || quantiteLibre < 1) return

    setPanier((prev) => [
      ...prev,
      { type: 'libre', cle: `${Date.now()}-${Math.random()}`, nom, prixUnitaire: prix, quantite: quantiteLibre },
    ])
    setNomLibre('')
    setPrixLibre('')
    setQuantiteLibre(1)
    setAfficherFormLibre(false)
  }

  function retirerLigne(index: number) {
    setPanier((prev) => prev.filter((_, i) => i !== index))
  }

  async function validerVente() {
    if (panier.length === 0) return
    setEnCours(true)
    setErreur(null)
    setSucces(null)

    const supabase = createClient()
    const articles = panier.map((l) =>
      l.type === 'catalogue'
        ? { produit_id: l.produitId, quantite: l.quantite }
        : { nom: l.nom, prix_unitaire: l.prixUnitaire, quantite: l.quantite }
    )

    const { error } = await supabase.rpc('creer_vente', {
      p_boutique_id: boutiqueId,
      p_articles: articles,
      p_client_nom: clientNom.trim() || null,
      p_client_telephone: clientTelephone.trim() || null,
      p_origine: 'caisse',
      p_mode_paiement: modePaiement,
      p_notes: notes.trim() || null,
    })

    setEnCours(false)

    if (error) {
      setErreur(messageErreur(error))
      return
    }

    setSucces('Vente enregistrée avec succès.')
    setPanier([])
    setClientNom('')
    setClientTelephone('')
    setNotes('')
    router.refresh()
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} style={styles.boutonOuvrir}>
        + Nouvelle vente
      </button>
    )
  }

  return (
    <div style={styles.panneau}>
      <div style={styles.enteteForm}>
        <h3 style={styles.titreForm}>Nouvelle vente</h3>
        <button
          type="button"
          onClick={() => {
            setOuvert(false)
            setErreur(null)
            setSucces(null)
          }}
          style={styles.boutonFermer}
        >
          Fermer
        </button>
      </div>

      <div style={styles.ligneAjout}>
        <select value={produitChoisi} onChange={(e) => setProduitChoisi(e.target.value)} style={styles.select}>
          <option value="">Choisir un produit du catalogue…</option>
          {produitsVendables.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom} — {p.prix} {devise} ({p.stock} en stock)
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={quantiteProduit}
          onChange={(e) => setQuantiteProduit(Math.max(1, Number(e.target.value) || 1))}
          style={styles.inputQuantite}
        />
        <button type="button" onClick={ajouterProduitCatalogue} disabled={!produitChoisi} style={styles.boutonAjouter}>
          Ajouter
        </button>
      </div>

      {!afficherFormLibre ? (
        <button type="button" onClick={() => setAfficherFormLibre(true)} style={styles.boutonArticleLibre}>
          + Article libre
        </button>
      ) : (
        <div style={styles.formLibre}>
          <input
            type="text"
            placeholder="Désignation"
            value={nomLibre}
            onChange={(e) => setNomLibre(e.target.value)}
            style={styles.inputTexte}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={`Prix unitaire (${devise})`}
            value={prixLibre}
            onChange={(e) => setPrixLibre(e.target.value)}
            style={styles.inputPrix}
          />
          <input
            type="number"
            min={1}
            value={quantiteLibre}
            onChange={(e) => setQuantiteLibre(Math.max(1, Number(e.target.value) || 1))}
            style={styles.inputQuantite}
          />
          <button type="button" onClick={ajouterArticleLibre} style={styles.boutonAjouter}>
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => {
              setAfficherFormLibre(false)
              setNomLibre('')
              setPrixLibre('')
              setQuantiteLibre(1)
            }}
            style={styles.boutonAnnulerLibre}
          >
            Annuler
          </button>
        </div>
      )}

      {panier.length === 0 ? (
        <p style={styles.panierVide}>Panier vide — ajoutez un produit ou un article libre.</p>
      ) : (
        <div style={styles.panierListe}>
          {panier.map((ligne, index) => (
            <div key={ligne.type === 'catalogue' ? ligne.produitId + index : ligne.cle} style={styles.ligneRecap}>
              <div>
                {ligne.type === 'libre' && <span style={styles.badgeLibre}>Article libre</span>}
                <span style={styles.nomLigne}>{ligne.nom}</span>
                <span style={styles.detailLigne}>
                  {' '}
                  — {ligne.quantite} × {ligne.prixUnitaire} {devise} = {ligne.quantite * ligne.prixUnitaire} {devise}
                </span>
              </div>
              <button type="button" onClick={() => retirerLigne(index)} style={styles.boutonRetirer}>
                ✕
              </button>
            </div>
          ))}
          <div style={styles.totalLigne}>
            Total : {total} {devise}
          </div>
        </div>
      )}

      <div style={styles.champsClient}>
        <input
          type="text"
          placeholder="Nom du client (optionnel)"
          value={clientNom}
          onChange={(e) => setClientNom(e.target.value)}
          style={styles.inputTexte}
        />
        <input
          type="tel"
          placeholder="Téléphone (optionnel)"
          value={clientTelephone}
          onChange={(e) => setClientTelephone(e.target.value)}
          style={styles.inputTexte}
        />
        <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)} style={styles.select}>
          {MODES_PAIEMENT.map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Notes (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={styles.inputTexte}
        />
      </div>

      {erreur && <div style={styles.messageErreur}>{erreur}</div>}
      {succes && <div style={styles.messageSucces}>{succes}</div>}

      <button
        type="button"
        onClick={validerVente}
        disabled={panier.length === 0 || enCours}
        style={styles.boutonValider}
      >
        {enCours ? 'Enregistrement…' : 'Valider la vente'}
      </button>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  boutonOuvrir: {
    padding: '10px 16px',
    borderRadius: 10,
    background: '#006B3C',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 16,
  },
  panneau: {
    background: '#F9F6F0',
    border: '1px solid #E8E2D9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  enteteForm: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  titreForm: { fontSize: 15, fontWeight: 800, margin: 0 },
  boutonFermer: {
    background: 'none',
    border: 'none',
    color: '#7A7A7A',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  ligneAjout: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  select: {
    flex: '1 1 220px',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #E8E2D9',
    fontSize: 13,
  },
  inputQuantite: {
    width: 70,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #E8E2D9',
    fontSize: 13,
  },
  inputPrix: {
    width: 130,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #E8E2D9',
    fontSize: 13,
  },
  inputTexte: {
    flex: '1 1 180px',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #E8E2D9',
    fontSize: 13,
  },
  boutonAjouter: {
    padding: '8px 14px',
    borderRadius: 8,
    background: '#006B3C',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
  boutonArticleLibre: {
    alignSelf: 'flex-start',
    padding: '8px 14px',
    borderRadius: 8,
    background: 'transparent',
    color: '#006B3C',
    fontSize: 13,
    fontWeight: 700,
    border: '1px dashed #006B3C',
    cursor: 'pointer',
  },
  formLibre: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  boutonAnnulerLibre: {
    background: 'none',
    border: 'none',
    color: '#7A7A7A',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  panierVide: { color: '#7A7A7A', fontSize: 13, margin: 0 },
  panierListe: { display: 'flex', flexDirection: 'column', gap: 6 },
  ligneRecap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#fff',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
  },
  badgeLibre: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: '#D4A017',
    borderRadius: 6,
    padding: '2px 6px',
    marginRight: 6,
  },
  nomLigne: { fontWeight: 700 },
  detailLigne: { color: '#7A7A7A' },
  boutonRetirer: {
    background: 'none',
    border: 'none',
    color: '#C41E3A',
    fontSize: 14,
    cursor: 'pointer',
  },
  totalLigne: { fontWeight: 900, fontSize: 15, color: '#006B3C', textAlign: 'right', marginTop: 4 },
  champsClient: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  messageErreur: {
    background: 'rgba(196,30,58,.08)',
    border: '1px solid rgba(196,30,58,.25)',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#C41E3A',
    fontSize: 13,
  },
  messageSucces: {
    background: 'rgba(0,107,60,.08)',
    border: '1px solid rgba(0,107,60,.25)',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#006B3C',
    fontSize: 13,
  },
  boutonValider: {
    padding: '12px 18px',
    borderRadius: 10,
    background: '#006B3C',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
}
