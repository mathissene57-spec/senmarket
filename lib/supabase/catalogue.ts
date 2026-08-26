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
  prixPromo: number | null
  stock: number
  categorie: string | null
  badge: string | null
  emoji: string | null
  image_url: string | null
  livraison: boolean
  produit_images: ProduitImage[]
}

type Promotion = {
  type: 'pourcentage' | 'prix_fixe'
  valeur: number
}

/**
 * Charge les promotions actuellement actives (actif=true et date courante
 * dans [date_debut, date_fin]), une par produit -- en cas de promotions
 * concurrentes sur le meme produit, celle de plus haute `priorite` gagne.
 * Meme logique que le prototype `senmarket-html` (fenetre de dates verifiee
 * cote code, pas par la requete : "maintenant" ne se filtre pas en SQL ici).
 */
async function chargerPromotionsActives(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, Promotion>> {
  const { data, error } = await supabase
    .from('promotions')
    .select('produit_id, type, valeur, date_debut, date_fin')
    .eq('actif', true)
    .order('priorite', { ascending: false })

  if (error) {
    throw new Error(`Impossible de charger les promotions : ${error.message}`)
  }

  const maintenant = Date.now()
  const promoParProduit = new Map<string, Promotion>()
  for (const promo of data ?? []) {
    if (promoParProduit.has(promo.produit_id)) continue
    const debut = new Date(promo.date_debut).getTime()
    const fin = new Date(promo.date_fin).getTime()
    if (maintenant < debut || maintenant > fin) continue
    promoParProduit.set(promo.produit_id, { type: promo.type, valeur: promo.valeur })
  }
  return promoParProduit
}

function calculerPrixPromo(prix: number, promo: Promotion | undefined): number | null {
  if (!promo) return null
  const prixPromo = promo.type === 'pourcentage' ? prix * (1 - promo.valeur / 100) : promo.valeur
  return Math.round(prixPromo * 100) / 100
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
 *
 * Deux requetes separees plutot qu'un embed PostgREST `boutiques -> produits` :
 * `produits.boutique_id` n'a pas de contrainte de cle etrangere vers
 * `boutiques.id` dans le schema reel (verifie sur pg_constraint), donc
 * PostgREST ne peut pas resoudre cette relation ("Could not find a
 * relationship between 'boutiques' and 'produits' in the schema cache").
 * L'embed `produit_images` reste utilisable : sa FK vers `produits` existe.
 */
export async function getCatalogue(): Promise<Boutique[]> {
  const supabase = await createClient()

  const [{ data: boutiquesData, error: erreurBoutiques }, promoParProduit] = await Promise.all([
    supabase
      .from('boutiques')
      .select(
        `id, nom, description, ville, categorie, whatsapp, emoji,
        verifie, note, actif, logo_url, banniere_url, devise`
      )
      .eq('actif', true)
      .order('nom', { ascending: true }),
    chargerPromotionsActives(supabase),
  ])

  if (erreurBoutiques) {
    throw new Error(`Impossible de charger le catalogue : ${erreurBoutiques.message}`)
  }

  const boutiques = boutiquesData ?? []
  if (boutiques.length === 0) {
    return []
  }

  const { data: produitsData, error: erreurProduits } = await supabase
    .from('produits')
    .select(
      `id, boutique_id, nom, description, prix, stock, categorie,
      badge, emoji, image_url, livraison,
      produit_images ( id, url, ordre )`
    )
    .eq('actif', true)
    .in(
      'boutique_id',
      boutiques.map((boutique) => boutique.id)
    )

  if (erreurProduits) {
    throw new Error(`Impossible de charger le catalogue : ${erreurProduits.message}`)
  }

  const produitsParBoutique = new Map<string, Produit[]>()
  for (const produit of produitsData ?? []) {
    const produitTrie = {
      ...produit,
      prixPromo: calculerPrixPromo(produit.prix, promoParProduit.get(produit.id)),
      produit_images: [...(produit.produit_images ?? [])].sort((a, b) => a.ordre - b.ordre),
    } as Produit
    const liste = produitsParBoutique.get(produit.boutique_id) ?? []
    liste.push(produitTrie)
    produitsParBoutique.set(produit.boutique_id, liste)
  }

  return boutiques.map((boutique) => ({
    ...boutique,
    produits: produitsParBoutique.get(boutique.id) ?? [],
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
 *
 * Deux requetes separees (produit, puis boutique) pour la meme raison que
 * getCatalogue() : pas de FK `produits.boutique_id -> boutiques.id` dans le
 * schema reel, donc l'embed `boutique:boutiques(...)` est irresoluble par
 * PostgREST.
 */
export async function getProduit(id: string): Promise<ProduitDetail | null> {
  const supabase = await createClient()

  const { data: produitData, error: erreurProduit } = await supabase
    .from('produits')
    .select(
      `id, boutique_id, nom, description, prix, stock, categorie,
      badge, emoji, image_url, livraison,
      produit_images ( id, url, ordre )`
    )
    .eq('id', id)
    .eq('actif', true)
    .maybeSingle()

  if (erreurProduit) {
    throw new Error(`Impossible de charger le produit : ${erreurProduit.message}`)
  }

  if (!produitData) {
    return null
  }

  const [{ data: boutique, error: erreurBoutique }, promoParProduit] = await Promise.all([
    supabase
      .from('boutiques')
      .select('id, nom, devise, logo_url, emoji, whatsapp, ville, categorie, verifie, note, actif')
      .eq('id', produitData.boutique_id)
      .maybeSingle(),
    chargerPromotionsActives(supabase),
  ])

  if (erreurBoutique) {
    throw new Error(`Impossible de charger le produit : ${erreurBoutique.message}`)
  }

  if (!boutique || boutique.actif !== true) {
    return null
  }

  return {
    ...produitData,
    prixPromo: calculerPrixPromo(produitData.prix, promoParProduit.get(produitData.id)),
    boutique: boutique as BoutiqueResume,
    produit_images: [...(produitData.produit_images ?? [])].sort((a, b) => a.ordre - b.ordre),
  }
}
