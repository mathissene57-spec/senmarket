# Migration 6 — Matrice de visibilité (base de spécification)

Document produit, pas un draft SQL. Aucune policy RLS n'est écrite à partir de ce
document tant que la Specification M6 elle-même n'a pas été rédigée et validée.

## Statut

- Migration 6a (durcissement `anon` sur `organizations`/`hubs`/`pickup_points`/
  `transporters`) : appliquée le 7 septembre 2026, testée, en attente de validation
  des résultats avant commit/push. Elle a créé la frontière anon documentée ci-dessous.
- Tenant Isolation (Organisation A vs Organisation B) : **non spécifiée, non appliquée**.
  Cette matrice sert de base de discussion pour la future Specification M6, pas une
  décision arrêtée.

## Note de vocabulaire (correction actée)

Il n'existe **pas** de rôle `hub` dans `user_roles` (l'enum réel est `client` /
`agent_point_relais` / `transporteur` / `admin` — Migration 1). Les opérations "hub"
(ex. statut `at_hub`) sont réalisées par un utilisateur au rôle `agent_point_relais` dont
`user_roles.hub_id` est renseigné (vérifié dans `record_shipment_event()`). La colonne
ci-dessous s'appelle donc **« Agent PR — contexte Hub (hub_id) »**, pas « Hub », pour ne
pas laisser croire qu'un rôle `hub` existe ou doit être créé.

## Deux catégories de référentiels

**🌍 Référentiels globaux** — `countries`, `corridors` : configuration du Core,
indépendante de tout tenant, nécessaire à l'affichage de n'importe quel écran.

**🏢 Annuaire opérationnel** — `organizations`, `hubs`, `pickup_points`, `transporters` :
référentiels métier, potentiellement partagés entre organisations selon le cas d'usage,
avec une exposition de colonnes à contrôler indépendamment des lignes (RLS = quelles
lignes ; GRANT colonne = quelles colonnes — deux mécanismes distincts, à ne pas confondre).

## Matrice

| Ressource | Anon | Client | Agent PR | Transporteur | Agent PR — contexte Hub (hub_id) | Admin |
|---|---|---|---|---|---|---|
| Countries | lecture | lecture | lecture | lecture | lecture | lecture + écriture |
| Corridors | lecture | lecture | lecture | lecture | lecture | lecture + écriture |
| Organizations (nom, type) | aucun | lecture | lecture | lecture | lecture | lecture + écriture |
| Organizations (email, téléphone) | aucun | aucun | aucun | aucun | aucun | lecture + écriture |
| Hubs | aucun | lecture | lecture | lecture | lecture | lecture + écriture |
| Pickup points (nom, adresse, coordonnées) | aucun | lecture | lecture | lecture | lecture | lecture + écriture |
| Pickup points (téléphone) | aucun | aucun | lecture | lecture | lecture | lecture + écriture |
| Transporters (nom, trust_score) | aucun | lecture | lecture | lecture | lecture | lecture + écriture |
| Shipments | aucun | *(cf. note)* | *(cf. note)* | *(cf. note)* | *(cf. note)* | *(cf. note)* |
| Lots | aucun | — (non concerné) | — | *(cf. note)* | — | *(cf. note)* |
| Incidents | aucun | *(cf. note)* | *(cf. note)* | *(cf. note)* | — | *(cf. note)* |

**Note sur Shipments/Lots/Incidents** : la colonne "Anon" reflète l'état réel (aucun accès,
vérifié empiriquement — `42501` systématique). Les autres cellules ne sont **pas**
reformulées en "propriétaire seul" ou équivalent simplifié : l'accès réel est déterminé
par les règles des Migrations 1 à 4 et par `can_access_shipment()`, qui combinent
plusieurs conditions contextuelles (propriété du colis, affectation opérationnelle
courante, rôle de l'acteur). Cette matrice ne réécrit pas ces règles déjà auditées et
verrouillées — elle documente seulement, pour mémoire, qu'elles restent la source de
vérité pour ces trois ressources, sans chercher à les faire tenir dans une étiquette
unique par cellule.

## Ce que cette matrice ne tranche pas

- La ligne "Anon" sur `organizations`/`hubs`/`pickup_points`/`transporters` reflète l'état
  réel après Migration 6a, mais les colonnes des autres rôles (Client, Agent PR,
  Transporteur, Agent PR — contexte Hub, Admin) sur ces mêmes tables sont des
  **propositions**, pas un état déjà implémenté — aujourd'hui ces 4 tables sont encore en
  lecture publique totale (`using (true)`) pour tout rôle authentifié, sans distinction de
  colonne ni d'organisation. Passer de l'état actuel à cette matrice cible nécessiterait
  une vraie Specification M6 (RLS scoping + grants colonne par colonne), non écrite ici.
- Aucun cas d'usage réel n'a encore été confirmé pour justifier qu'un client voie la liste
  des points relais d'une organisation qui n'est pas la sienne, ou qu'un agent voie les
  coordonnées téléphoniques d'un point relais d'une autre organisation — ces propositions
  restent à valider avant toute écriture SQL.

## Prochaine étape

Specification M6 (RLS + grants détaillés, découlant de cette matrice une fois validée) →
revue humaine → SQL Draft M6 → préflight → GO → application. Aucune policy de Tenant
Isolation n'est écrite avant que cette séquence soit complète.
