import { createClient } from './server'

export type BoutiqueVendeur = {
  id: string
  nom: string
  devise: string
  actif: boolean
  verifie: boolean
  note: number
  nb_produits: number
  nb_ventes: number
}

export type ProduitVendeur = {
  id: string
  nom: string
  prix: number
  stock: number
  actif: boolean
  ventes: number
}

export type CommandeVendeur = {
  id: string
  client_nom: string | null
  client_telephone: string | null
  statut: string
  created_at: string
  origine: string
}

export type StatsBoutique = {
  panier_moyen: number | null
  nb_clients: number
  meilleur_client_nom: string | null
  meilleur_client_ca: number | null
  nb_commandes_avec_tel: number
  total_commandes: number
  couverture_pct: number
}

export type TopProduit = {
  produit_id: string
  nom_produit: string
  total_ventes: number
  total_revenu: number
}

export type DashboardBoutique = {
  boutique: BoutiqueVendeur
  produits: ProduitVendeur[]
  commandes: CommandeVendeur[]
  stats: StatsBoutique | null
  topProduits: TopProduit[]
}

export type DashboardVendeur = {
  connecte: boolean
  boutiques: DashboardBoutique[]
}

/**
 * Lecture seule : boutiques du vendeur connecte (vendor_id = auth.uid(),
 * applique par RLS -- on ne filtre pas manuellement ici, RLS le fait deja
 * pour "vendeur_voit_tous_ses_produits"/"vendeur_voit_ses_commandes"), avec
 * leurs produits, commandes recentes et statistiques (stats_clients_boutique
 * / top_produits_boutique, SECURITY INVOKER : scope automatiquement a la
 * boutique du vendeur, pas de verification manuelle a faire ici).
 *
 * Aucune ecriture. Ne modifie ni statut de commande, ni stock, ni aucune
 * donnee -- lecture seule, conformement au perimetre Phase 3B.4.
 */
export async function getDashboard(): Promise<DashboardVendeur> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { connecte: false, boutiques: [] }
  }

  const { data: boutiques, error: erreurBoutiques } = await supabase
    .from('boutiques')
    .select('id, nom, devise, actif, verifie, note, nb_produits, nb_ventes')
    .eq('vendor_id', user.id)
    .order('nom', { ascending: true })

  if (erreurBoutiques) {
    throw new Error(`Impossible de charger vos boutiques : ${erreurBoutiques.message}`)
  }

  const resultats: DashboardBoutique[] = []

  for (const boutique of boutiques ?? []) {
    const produitsRes = await supabase
      .from('produits')
      .select('id, nom, prix, stock, actif, ventes')
      .eq('boutique_id', boutique.id)
      .order('nom', { ascending: true })
    if (produitsRes.error) {
      throw new Error(`Impossible de charger les produits de ${boutique.nom} : ${produitsRes.error.message}`)
    }

    const commandesRes = await supabase
      .from('commandes')
      .select('id, client_nom, client_telephone, statut, created_at, origine')
      .eq('boutique_id', boutique.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (commandesRes.error) {
      throw new Error(`Impossible de charger les commandes de ${boutique.nom} : ${commandesRes.error.message}`)
    }

    // Corrigee cote backend (voir CLAUDE.md), mais on garde une degradation
    // propre par precaution : un echec ponctuel de cette RPC ne doit pas
    // faire planter tout le tableau de bord, seulement priver cette
    // boutique de ses stats.
    let stats: StatsBoutique | null = null
    const statsRes = await supabase.rpc('stats_clients_boutique', { p_boutique_id: boutique.id }).maybeSingle()
    if (!statsRes.error) {
      stats = statsRes.data as StatsBoutique | null
    }

    const topRes = await supabase.rpc('top_produits_boutique', { p_boutique_id: boutique.id, p_limit: 5 })
    if (topRes.error) {
      throw new Error(`Impossible de charger le top produits de ${boutique.nom} : ${topRes.error.message}`)
    }

    resultats.push({
      boutique,
      produits: produitsRes.data ?? [],
      commandes: commandesRes.data ?? [],
      stats,
      topProduits: topRes.data ?? [],
    })
  }

  return { connecte: true, boutiques: resultats }
}
