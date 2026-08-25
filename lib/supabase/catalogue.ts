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

export type BoutiqueResume = Pick<
  Boutique,
  'id' | 'nom' | 'devise' | 'logo_url' | 'emoji' | 'whatsapp' | 'ville' | 'categorie' | 'verifie' | 'note' | 'actif'
>

export type ProduitDetail = Produit & {
  boutique: BoutiqueResume
}

/**
 * Lecture seule : fiche d'un seul produit + sa boutique.
 * Meme principe que getCatalogue() : RLS n'exclut pas les produits d'une
 * boutique inactive, donc c'est verifie explicitement ici -- un produit
 * dont la boutique est actif = false est traite comme introuvable (null),
 * pour rester coherent avec ce qui est (ou n'est pas) visible dans le
 * catalogue.
 */
export async function getProduit(id: string): Promise<ProduitDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('produits')
    .select(
      `
      id, boutique_id, nom, description, prix, stock, categorie,
      badge, emoji, image_url, livraison,
      produit_images ( id, url, ordre ),
      boutique:boutiques ( id, nom, devise, logo_url, emoji, whatsapp, ville, categorie, verifie, note, actif )
      `
    )
    .eq('id', id)
    .eq('actif', true)
    .maybeSingle()

  if (error) {
    throw new Error(`Impossible de charger le produit : ${error.message}`)
  }

  if (!data) {
    return null
  }

  // Sans types generes depuis le schema, supabase-js type la relation
  // embarquee `boutique` comme un tableau, alors qu'a l'execution PostgREST
  // renvoie un seul objet pour une relation many-to-one (produits.boutique_id
  // -> boutiques.id). On normalise ici pour gerer les deux formes possibles.
  const boutiqueRaw = data.boutique as unknown
  const boutique = (Array.isArray(boutiqueRaw) ? boutiqueRaw[0] : boutiqueRaw) as BoutiqueResume | undefined

  if (!boutique || boutique.actif !== true) {
    return null
  }

  const { boutique: _ignore, ...produit } = data as unknown as Produit & { boutique: unknown }

  return {
    ...produit,
    boutique,
    produit_images: [...(produit.produit_images ?? [])].sort((a, b) => a.ordre - b.ordre),
  }
}
