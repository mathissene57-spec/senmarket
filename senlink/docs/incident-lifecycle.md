# SenLink — Cycle de vie d'un incident

> Décidé le 8 septembre 2026, en réponse aux questions posées dans l'audit
> parcours colis (§11 : « qui ouvre, qui traite, qui résout, qui clôture »).
> Aucune migration n'a été nécessaire — le schéma (`incidents_admin_update`,
> les colonnes `resolution_notes`/`resolved_at`) posait déjà exactement ce
> modèle ; il ne restait qu'une interface pour l'utiliser.

## États

`open` → `investigating` → `resolved` → `closed`, strictement linéaire (pas
de retour arrière, pas de saut d'étape). Valeurs libres (`text`, pas de
`CHECK`), comme `commandes.statut` côté SenMarket — convention, pas
contrainte SQL.

## Qui fait quoi

| Étape | Qui peut la déclencher | Preuve exigée |
|---|---|---|
| Déclarer (`open`) | Client propriétaire, transporteur assigné, agent du point relais concerné, admin — tout rôle que `can_access_shipment()` autorise sur le colis | Aucune contrainte serveur ; le formulaire transporteur permet une description libre |
| `investigating`, `resolved`, `closed` | **Admin uniquement** — `incidents_admin_update` (RLS) restreint déjà l'`UPDATE` à `is_admin()` | Aucune (décision explicite, voir ci-dessous) |

Le déclarant (transporteur, agent, client) ne peut **pas** résoudre ou
clôturer son propre incident — seulement le déclarer et le consulter. Ce
n'est pas une lacune : c'est le comportement déjà en place dans la RLS,
confirmé comme choix définitif plutôt que reconsidéré.

## Décisions explicites (les 3 questions tranchées)

1. **Résolution admin-only, pas de délégation au transporteur/agent.**
   Cohérent avec l'ambition « SenLink Control Tower » : l'admin est le seul
   point de supervision réseau, et un incident touche souvent plusieurs
   acteurs (transporteur + point relais) — le faire trancher par une seule
   des parties aurait été juge-et-partie.
2. **Aucune preuve obligatoire pour résoudre.** `resolution_notes` reste un
   champ libre, non contraint en base. Beaucoup de résolutions se font par
   un canal qui ne produit pas de preuve numérique (appel téléphonique,
   accord amiable) — imposer une preuve aurait bloqué des cas réels sans
   bénéfice de traçabilité proportionné.
3. **Un écran admin minimal est construit maintenant**
   (`app/dashboard/admin/incidents/page.tsx`), séparé du futur chantier
   Control Tower complet. Sans lui, les incidents déclarés s'accumulaient
   sans qu'aucune interface ne permette de les traiter — pas même l'admin.

## Ce qui n'a pas changé

- Aucune migration Supabase : les policies (`incidents_select`,
  `incidents_insert`, `incidents_admin_update`) et les colonnes existantes
  suffisaient déjà.
- La déclaration côté transporteur (`app/dashboard/transporteur/incidents/page.tsx`)
  reste une insertion directe (pas de RPC dédiée) — inchangé.
