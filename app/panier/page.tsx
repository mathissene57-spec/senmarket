'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePanier } from '@/lib/panier/PanierProvider'
import { createClient } from '@/lib/supabase/client'

type Confirmation = {
  commandeId: string
  boutiqueNom: string
  boutiqueWhatsapp: string | null
  total: number
  devise: string
  telephone: string
  recapitulatif: { nom: string; quantite: number }[]
}

export default function PanierPage() {
  const { items, boutiqueId, total, modifierQuantite, retirer, vider } = usePanier()
  const [telephone, setTelephone] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  async function passerCommande() {
    if (!boutiqueId || items.length === 0) return

    setEnCours(true)
    setErreur(null)

    const supabase = createClient()
    // Le serveur (creer_commande_complete) recalcule prix, nom et stock
    // depuis `produits` -- on n'envoie jamais de prix, seulement produit_id
    // et quantite. La devise du panier vient uniquement de l'affichage,
    // elle n'est jamais transmise a la RPC.
    const { data, error } = await supabase.rpc('creer_commande_complete', {
      p_boutique_id: boutiqueId,
      p_client_telephone: telephone.trim() || null,
      p_items: items.map((item) => ({ produit_id: item.produitId, quantite: item.quantite })),
    })

    setEnCours(false)

    if (error) {
      setErreur(error.message)
      return
    }

    setConfirmation({
      commandeId: data as string,
      boutiqueNom: items[0].boutiqueNom,
      boutiqueWhatsapp: items[0].boutiqueWhatsapp,
      total,
      devise: items[0].devise,
      telephone: telephone.trim(),
      recapitulatif: items.map((i) => ({ nom: i.nom, quantite: i.quantite })),
    })
    vider()
  }

  function ouvrirWhatsapp() {
    if (!confirmation || !confirmation.boutiqueWhatsapp) return
    const numero = confirmation.boutiqueWhatsapp.replace(/\D/g, '')
    const lignes = confirmation.recapitulatif.map((l) => `${l.quantite}x ${l.nom}`).join('\n')
    const message = [
      `Bonjour ! Je viens de passer une commande sur SenMarket.`,
      `Référence : ${confirmation.commandeId.slice(0, 8)}`,
      '',
      lignes,
      '',
      `Total : ${confirmation.total} ${confirmation.devise}`,
      confirmation.telephone ? `Mon téléphone : ${confirmation.telephone}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`, '_blank')
  }

  if (confirmation) {
    return (
      <main style={styles.page}>
        <div style={styles.confirmationBox}>
          <div style={styles.confirmationIcone}>✅</div>
          <h1 style={styles.titre}>Commande créée</h1>
          <p style={styles.sousTitre}>
            Référence <strong>{confirmation.commandeId.slice(0, 8)}</strong> auprès de{' '}
            <strong>{confirmation.boutiqueNom}</strong>
          </p>
          <p style={styles.totalConfirmation}>
            Total : {confirmation.total} {confirmation.devise}
          </p>

          {confirmation.boutiqueWhatsapp ? (
            <button type="button" onClick={ouvrirWhatsapp} style={styles.btnWhatsapp}>
              💬 Confirmer via WhatsApp
            </button>
          ) : (
            <p style={styles.vide}>
              Le vendeur n&apos;a pas renseigné de numéro WhatsApp. Il traitera votre commande directement.
            </p>
          )}

          <Link href="/catalogue" style={styles.lienCatalogue}>
            Continuer mes achats
          </Link>
        </div>
      </main>
    )
  }

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
        <button type="button" onClick={vider} style={styles.btnVider} disabled={enCours}>
          Vider le panier
        </button>
        <div style={styles.total}>
          Total : <strong>{total} {devise}</strong>
        </div>
      </div>

      <div style={styles.champTelephone}>
        <label style={styles.label} htmlFor="telephone">
          Téléphone (recommandé, pour retrouver votre commande)
        </label>
        <input
          id="telephone"
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="+212 6XX XXX XXX"
          style={styles.input}
          disabled={enCours}
        />
      </div>

      {erreur && <div style={styles.erreurBox}>{erreur}</div>}

      <button type="button" onClick={passerCommande} style={styles.btnCommander} disabled={enCours}>
        {enCours ? 'Envoi en cours...' : 'Passer commande'}
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
  champTelephone: { marginTop: 20 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#7A7A7A', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1.5px solid #E8E2D9',
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  erreurBox: {
    marginTop: 16,
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(196,30,58,.08)',
    border: '1px solid rgba(196,30,58,.25)',
    color: '#C41E3A',
    fontSize: 13,
  },
  btnCommander: {
    width: '100%',
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    background: '#006B3C',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
  confirmationBox: {
    background: '#FFFFFF',
    border: '1px solid #E8E2D9',
    borderRadius: 18,
    padding: 32,
    textAlign: 'center',
    marginTop: 40,
  },
  confirmationIcone: { fontSize: 40, marginBottom: 8 },
  totalConfirmation: { fontSize: 18, fontWeight: 900, color: '#006B3C', margin: '16px 0' },
  btnWhatsapp: {
    display: 'inline-block',
    padding: '14px 24px',
    borderRadius: 14,
    background: '#25D366',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 20,
  },
}
