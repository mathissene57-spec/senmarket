'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const CLE_STOCKAGE = 'senmarket_panier'

export type PanierItem = {
  produitId: string
  boutiqueId: string
  boutiqueNom: string
  boutiqueWhatsapp: string | null
  devise: string
  nom: string
  prix: number
  image: string | null
  emoji: string | null
  stockDisponible: number
  quantite: number
}

type ResultatAjout = { ok: true } | { ok: false; conflit: true; boutiqueActuelle: string }

type PanierContextValue = {
  items: PanierItem[]
  boutiqueId: string | null
  total: number
  ajouter: (item: Omit<PanierItem, 'quantite'>, quantite: number) => ResultatAjout
  ajouterEnRemplacant: (item: Omit<PanierItem, 'quantite'>, quantite: number) => void
  modifierQuantite: (produitId: string, delta: number) => void
  retirer: (produitId: string) => void
  vider: () => void
}

const PanierContext = createContext<PanierContextValue | null>(null)

function chargerDepuisStockage(): PanierItem[] {
  if (typeof window === 'undefined') return []
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE)
    return brut ? (JSON.parse(brut) as PanierItem[]) : []
  } catch {
    return []
  }
}

export function PanierProvider({ children }: { children: React.ReactNode }) {
  // Etat initial vide pour eviter un ecart de rendu serveur/client
  // (localStorage n'existe pas cote serveur) -- charge reellement au montage.
  const [items, setItems] = useState<PanierItem[]>([])
  const [pret, setPret] = useState(false)

  useEffect(() => {
    setItems(chargerDepuisStockage())
    setPret(true)
  }, [])

  useEffect(() => {
    if (!pret) return
    window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(items))
  }, [items, pret])

  const boutiqueId = items[0]?.boutiqueId ?? null

  function ajouter(item: Omit<PanierItem, 'quantite'>, quantite: number): ResultatAjout {
    if (boutiqueId && boutiqueId !== item.boutiqueId) {
      return { ok: false, conflit: true, boutiqueActuelle: items[0].boutiqueNom }
    }
    ajouterSansVerif(item, quantite)
    return { ok: true }
  }

  function ajouterSansVerif(item: Omit<PanierItem, 'quantite'>, quantite: number) {
    setItems((actuel) => {
      const existant = actuel.find((i) => i.produitId === item.produitId)
      if (existant) {
        const nouvelleQuantite = Math.min(existant.quantite + quantite, item.stockDisponible)
        return actuel.map((i) => (i.produitId === item.produitId ? { ...i, quantite: nouvelleQuantite } : i))
      }
      return [...actuel, { ...item, quantite: Math.min(quantite, item.stockDisponible) }]
    })
  }

  function ajouterEnRemplacant(item: Omit<PanierItem, 'quantite'>, quantite: number) {
    setItems([{ ...item, quantite: Math.min(quantite, item.stockDisponible) }])
  }

  function modifierQuantite(produitId: string, delta: number) {
    setItems((actuel) =>
      actuel
        .map((i) =>
          i.produitId === produitId
            ? { ...i, quantite: Math.min(Math.max(i.quantite + delta, 0), i.stockDisponible) }
            : i
        )
        .filter((i) => i.quantite > 0)
    )
  }

  function retirer(produitId: string) {
    setItems((actuel) => actuel.filter((i) => i.produitId !== produitId))
  }

  function vider() {
    setItems([])
  }

  const total = items.reduce((somme, i) => somme + i.prix * i.quantite, 0)

  return (
    <PanierContext.Provider
      value={{ items, boutiqueId, total, ajouter, ajouterEnRemplacant, modifierQuantite, retirer, vider }}
    >
      {children}
    </PanierContext.Provider>
  )
}

export function usePanier() {
  const ctx = useContext(PanierContext)
  if (!ctx) {
    throw new Error('usePanier doit etre utilise a l\'interieur de <PanierProvider>')
  }
  return ctx
}
