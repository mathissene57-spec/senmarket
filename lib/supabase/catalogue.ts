import { createClient } from './server'

export type ProduitImage = {
  id: string
  url: string
  ordre: number
}

export type Produit = {
  id: string
  boutique_id: string
  nom: string
  description: string | null
  prix: number
  stock: number
  categorie: string | null
  badge: string | null
  emoji: string | null
  image_url: string | null
  livraison: boolean
  produit_images: ProduitImage[]
}

export type Boutique = {
  id: string
  nom: string
  description: string | null
  ville: string | null
  categorie: string | null
  whatsapp: string | null
  emoji: string | null
  verifie: boolean
  note: number
  actif: boolean
  logo_url: string | null
  banniere_url: string | null
  devise: string
  produits: Produit[]
}

/**
 * Lecture seule : boutiques actives + leurs produits actifs + images.
 * RLS ne filtre pas les boutiques par `actif` (policy publique = true sans
 * condition) ni les produits par le statut de leur boutique -- ce filtrage
 * est donc fait ici, cote requete, pas garanti par la base. Voir CLAUDE.md
 * ("RLS / ownership model") pour le detail de ce comportement reel.
 */
export async function getCatalogue(): Promise<Boutique[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boutiques')
    .select(
      `
      id, nom, description, ville, categorie, whatsapp, emoji,
      verifie, note, actif, logo_url, banniere_url, devise,
      produits (
        id, boutique_id, nom, description, prix, stock, categorie,
        badge, emoji, image_url, livraison,
        produit_images ( id, url, ordre )
      )
      `
    )
    .eq('actif', true)
    .eq('produits.actif', true)
    .order('nom', { ascending: true })

  if (error) {
    throw new Error(`Impossible de charger le catalogue : ${error.message}`)
  }

  return (data ?? []).map((boutique) => ({
    ...boutique,
    produits: (boutique.produits ?? []).map((produit) => ({
      ...produit,
      produit_images: [...(produit.produit_images ?? [])].sort((a, b) => a.ordre - b.ordre),
    })),
  })) as Boutique[]
}
