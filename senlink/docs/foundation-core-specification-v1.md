# Foundation Core Specification V1.1 — SenLink

Conception uniquement. Aucun SQL exécutable dans ce document, aucune écriture en base,
aucun commit/push tant que cette spécification n'a pas été explicitement validée par un
GO séparé pour l'étape suivante (SQL Draft de Migration 5).

Construite sur `Foundation Core Discovery Report V1` (7 septembre 2026) et deux tours
d'arbitrage humain. Cette version (V1.1) intègre les corrections demandées lors de la
revue de la V1.0 — notamment une correction technique importante découverte en creusant
le comportement réel de `record_shipment_event()` (voir §4).

## Changelog V1.0 → V1.1

- Tenant anchoring : remplacement du trigger générique "recalcule à chaque UPDATE" par
  une dérivation événementielle précise (créations, première assignation, changement de
  responsabilité) — jamais sur une simple mise à jour de poids/dimensions/métadonnées.
- Découverte en cours de rédaction, vérifiée sur le code réel : `assigned_transporter_id`,
  `current_hub_id` et `current_pickup_point_id` ne sont PAS mutuellement exclusifs dans
  `record_shipment_event()` — ils restent tous les trois renseignés simultanément une fois
  atteints (aucun n'est réinitialisé après `departed_origin`, sauf `current_pickup_point_id`
  au moment précis de ce départ). La dérivation du tenant doit donc se baser sur le
  **statut du colis**, pas sur "quelle colonne est non-nulle" — voir §4 pour le détail et
  les points encore ouverts.
- Historique de participation : confirmé hors V1, `organization_id` = responsable actuel
  uniquement, pas de nouvelle table.
- Corridors : MA→SN et SN→MA tous deux semés dès Migration 5, `origin_country <>
  destination_country` retenu comme contrainte.
- Currency : deux variantes analysées, recommandation motivée par une contrainte réelle
  (NOT NULL existant + interdiction de toucher au Next.js), pas seulement par principe —
  voir §8.
- Ordre des triggers : inventaire réel vérifié en base (5 triggers existants sur
  `shipments`/`shipment_lots`), argumentation sur l'absence de dépendance d'ordre.
- Ajout d'un point de vigilance sur les grants colonne-par-colonne (`organization_id` ne
  sera lisible par personne tant qu'un GRANT explicite n'est pas ajouté — comportement par
  défaut sûr, à confirmer intentionnel).

## 1. Modèle conceptuel cible

```
countries (nouveau, référentiel)
    │  (remplace les 4 CHECK 'MA'/'SN')
    ├── organizations.country
    ├── hubs.country
    ├── pickup_points.country
    └── corridors.origin_country / corridors.destination_country

corridors (nouveau, entité métier directionnelle)
    — consulté par lookup (pas de FK stockée) lors de la création d'un
      shipment et lors de son affectation/réaffectation à un lot.

organizations (existant, inchangé)
    │  (nouveau lien, dérivé — jamais saisi par un utilisateur)
    ├── shipments.organization_id   [NOUVEAU, nullable]
    └── shipment_lots.organization_id [NOUVEAU, nullable]
```

Principe directeur : aucune addition sans consommateur réel démontré. Toute colonne
« pour plus tard » sans preuve d'usage est explicitement exclue (voir §2).

## 2. Dictionnaire des nouvelles entités

**countries**
- `code` text PK — ISO 3166-1 alpha-2, convention 2 lettres déjà en usage ('MA','SN').
- `name` text NOT NULL — nécessaire dès qu'un vrai libellé humain est requis (le code
  brut ne suffira plus au-delà de 2 pays).
- `default_currency` text NOT NULL — mécanisme concret de suppression du hardcode
  `currency DEFAULT 'MAD'` (voir §8), pas un moteur de devises.
- `active` boolean NOT NULL DEFAULT true — cohérent avec `hubs.active` /
  `organizations.active` / `transporters.active`, gate applicative, pas une contrainte
  référentielle.
- Explicitement exclus (aucun consommateur réel identifié) : indicatif téléphonique,
  toute colonne de configuration/paramètres pays en `jsonb`.

**corridors**
- `id` uuid PK default `gen_random_uuid()`.
- `origin_country` text NOT NULL REFERENCES countries(code)
- `destination_country` text NOT NULL REFERENCES countries(code)
- `active` boolean NOT NULL DEFAULT true — traduction directe de « un pays autorisé ≠ un
  corridor autorisé ».
- `created_at` timestamptz NOT NULL DEFAULT now()
- `CHECK (origin_country <> destination_country)` — **validé** : pas de corridor
  domestique en V1.
- `UNIQUE (origin_country, destination_country)` — un corridor est directionnel ; MA→SN
  et SN→MA sont deux lignes indépendantes, chacune activable/désactivable séparément.
- Seedées à la migration : **MA→SN et SN→MA, toutes deux `active = true`** — décision
  explicite pour ne pas transformer le sens de trafic actuel du pilote en contrainte
  d'architecture.
- Explicitement exclu : toute colonne `metadata`/configuration par corridor — aucun
  consommateur actuel (candidat naturel pour une V2 si un besoin réel apparaît, ex.
  règles douanières spécifiques à un corridor).

Aucune colonne `organization_id` sur `countries` ou `corridors` : ce sont des
référentiels globaux du Core, pas des ressources appartenant à un tenant.

## 3. Dictionnaire des relations

- `countries.code` ←(FK, remplace CHECK)— `organizations.country`, `hubs.country`,
  `pickup_points.country`
- `countries.code` ←(FK)— `corridors.origin_country`, `corridors.destination_country`
- `shipments.origin_country` / `destination_country` : rôle inchangé, seul le mécanisme
  de validation passe de CHECK à FK.
- `corridors(origin_country, destination_country)` — consultée par lookup, jamais par FK
  stockée depuis `shipments` (pas de `shipments.corridor_id` — validé, voir §6 raisonnement).
- `organizations.id` ←(FK, NOUVEAU)— `shipments.organization_id` (nullable),
  `shipment_lots.organization_id` (nullable)

## 4. Règles d'appartenance tenant — révisées en V1.1

### 4.1 Constat vérifié sur le code réel (pas supposé)

Lecture directe de `record_shipment_event()` (`20260831090000_security_core.sql`,
lignes 403-413) : la clause `SET` de l'unique `UPDATE public.shipments` touche
systématiquement les trois colonnes `current_pickup_point_id`, `current_hub_id`,
`assigned_transporter_id` à **chaque** appel, quel que soit le statut visé — leurs
valeurs sont calculées par `CASE`/`COALESCE`, mais Postgres considère la colonne comme
« touchée » dès qu'elle apparaît dans le `SET`, y compris quand la valeur ne change pas.

Plus important, en reconstituant le parcours réel statut par statut (lignes 282-347) :
- `current_pickup_point_id` est mis à `NULL` **uniquement** au moment de `departed_origin`
  (`v_clear_pickup_point := true`), puis re-renseigné plus tard à `at_pickup_point`.
- `current_hub_id` n'est **jamais** remis à `NULL` une fois renseigné (`at_hub`).
- `assigned_transporter_id` n'est **jamais** remis à `NULL` une fois renseigné
  (`departed_origin`).

Conséquence concrète : à la fin d'un parcours normal (`at_pickup_point`, `out_for_delivery`,
`delivered`), **les trois colonnes sont simultanément non-nulles** — point relais
d'origine remplacé par le point relais de destination, mais hub et transporteur restent
affichés comme "actuels" alors qu'ils ne le sont plus physiquement. **Une dérivation
naïve ("l'organisation de la première colonne non-nulle trouvée") serait donc fausse.**

### 4.2 Conséquence sur la conception : dérivation par statut, pas par colonne — TRANCHÉ

`organization_id` doit être dérivé d'un mapping **statut → colonne faisant autorité**,
pas d'une simple priorité entre colonnes. Arbitrage final (revue humaine) :

| Statut(s) | Organisation responsable | Source |
|---|---|---|
| `created` | `NULL` si création self-service client, sinon organisation du créateur (voir §4.5) | — |
| `dropped_off`, `inspected` | Point relais opérationnel | `current_pickup_point_id` → `pickup_points.organization_id` |
| `departed_origin`, `in_transit_international`, `customs_clearance` | Transporteur affecté | `assigned_transporter_id` → `transporters.organization_id` |
| `arrived_destination` | Hub de destination — **note technique importante**, voir ci-dessous | `shipment_lots.destination_hub_id` (via `shipments.lot_id`) → `hubs.organization_id` |
| `at_hub` | Hub courant | `current_hub_id` → `hubs.organization_id` |
| `at_pickup_point`, `out_for_delivery`, `delivered` | Point relais courant (destination) — le transporteur reste techniquement affecté sans être physiquement responsable à ce stade ; pas d'entité `last_mile_operator` dans le modèle actuel, donc pas de rattachement à un opérateur de livraison distinct | `current_pickup_point_id` → `pickup_points.organization_id` |
| `cancelled` | Conserver la dernière organisation responsable — aucun recalcul | `organization_id` inchangé (no-op explicite dans le trigger) |

**Note technique sur `arrived_destination`** : vérifié sur le code réel,
`current_hub_id` n'est renseigné qu'à `at_hub`, **un statut plus tard** — il est donc
encore `NULL` au moment précis de `arrived_destination`. La dérivation pour ce statut
utilise donc `shipment_lots.destination_hub_id` (déjà connu dès la création du lot) via
`shipments.lot_id`, plutôt que `shipments.current_hub_id`. **Cas limite — tranché par revue humaine (décision finale)** : si le colis n'a jamais
été rattaché à un lot (`lot_id IS NULL`) — possible car `record_shipment_event()`
n'exige jamais `lot_id` dans ses invariants —, Foundation V1 **ne bloque pas** la
transition vers `arrived_destination` et **ne modifie pas** `organization_id` (conserve
la dernière valeur connue). Un temps envisagé, le refus explicite (`RAISE EXCEPTION`) a
été écarté : il aurait introduit une exigence produit absente de Migration 1 elle-même
(aucun statut n'y requiert `lot_id`), ce qui dépasserait le mandat de Foundation V1
("construire le Core multi-pays/tenant", pas "redéfinir le parcours opérationnel des
colis"). La question "un colis peut-il légitimement atteindre `arrived_destination`
sans jamais être en lot ?" reste ouverte pour un futur chantier métier séparé.

Le recalcul est strictement déclenché par un changement de `status` (voir §4.3) — jamais
par une modification de poids, dimensions, valeur déclarée, métadonnées ou QR.

### 4.3 Mécanisme technique retenu (répond aux points 1 et 2 de ta revue)

Un **trigger scopé par colonnes**, pas un trigger générique :

```
BEFORE UPDATE OF status ON shipments FOR EACH ROW
  → ne recalcule organization_id QUE si NEW.status IS DISTINCT FROM OLD.status
  → applique le mapping du §4.2 sur NEW.status pour choisir la colonne source
```

En scopant le déclenchement sur la colonne `status` elle-même (qui ne change que via
`record_shipment_event()`, déjà verrouillé par `trg_prevent_direct_status_change`) plutôt
que sur les colonnes de localisation (qui sont, comme démontré en §4.1, systématiquement
« touchées » même sans changement réel), on garantit qu'**une simple mise à jour de
poids, dimensions ou métadonnées ne déclenche jamais ce trigger** — ces champs ne
modifient jamais `status`. C'est une garantie structurelle, pas une convention à respecter.

Pour `shipment_lots.organization_id` : dérivation unique **à la création** (`BEFORE
INSERT`), depuis `transporters.organization_id` du `transporter_id` déjà résolu par
`create_shipment_lot()` — pas de re-dérivation après coup, cohérent avec le constat du
§4.4 (un lot ne change jamais de transporteur après création).

### 4.4 Réponse au point 5 de ta revue — réaffectation à une autre organisation

Constat vérifié (`reassign_shipment_lot()`, lignes 595-597) : la fonction **exige**
`v_lot_from.transporter_id = v_lot_to.transporter_id = v_actor_ur.transporter_id` — le
lot source et le lot destination doivent appartenir au **même** transporteur que l'acteur.
**`reassign_shipment_lot()` ne peut donc jamais faire passer un colis d'une organisation
à une autre** — elle ne fait que déplacer un colis entre deux lots du même transporteur.

Le seul mécanisme qui fait réellement changer `organization_id` d'un shipment est la
progression naturelle du pipeline (point relais → transporteur → hub → point relais),
gérée exclusivement par `record_shipment_event()`. Il n'existe aujourd'hui **aucune**
capacité de transfert latéral entre deux organisations concurrentes du même type (ex.
Transporteur A → Transporteur B) — ni dans Migration 1, ni dans Migration 2. Foundation
V1 n'ajoute pas cette capacité (hors périmètre, non demandée).

### 4.5 Réponse au point 3 — dérivation par rôle à la création

| Créateur | organization_id à l'INSERT |
|---|---|
| Client self-service (`client_user_id = auth.uid()`, pas de staff impliqué) | `NULL` |
| Membre du staff (`created_by` a un rôle agent_point_relais/transporteur/admin dans `user_roles`) | `organization_id` de ce rôle (`user_roles.organization_id` du créateur) |

### 4.6 Réponse au point 4 — shipment avec organization_id = NULL

État valide et attendu tant qu'aucune assignation opérationnelle n'a eu lieu (un client
vient de créer son envoi, personne ne l'a encore pris en charge). Toute future
consommation de cette colonne (rapport, future RLS de Migration 6) doit traiter `NULL`
comme « pas encore rattaché à un tenant opérationnel », jamais comme une anomalie.

### 4.7 Historique de participation — confirmé hors V1

`organization_id` = organisation **actuellement responsable**, jamais un historique. Pas
de nouvelle table (`shipment_organizations`, `organization_participations` ou
équivalent). L'historique complet, si un jour nécessaire pour la Tenant Isolation, est
déjà intégralement reconstituable depuis `shipment_events` (append-only, jamais purgé) —
ce n'est pas un besoin non couvert, juste un besoin non anticipé par une colonne dédiée.

## 5. Règles pays

`countries.active` est une gate applicative (comme `hubs.active` aujourd'hui), pas une
contrainte référentielle — un hub peut référencer un pays `active = false` sans blocage
SQL ; le filtrage se ferait au niveau applicatif/RPC, exactement comme
`create_shipment_lot()` filtre déjà explicitement `hubs.active` aujourd'hui. Format :
code à 2 lettres majuscules, convention existante, pas de validation ISO stricte imposée.

## 6. Règles corridor

Un corridor est toujours directionnel. La présence de `'CI'` dans `countries` ne rend
**pas** automatiquement `MA→CI` valide — il faut une ligne `corridors` correspondante
avec `active = true`.

**Où la vérification a lieu** : un nouveau trigger `BEFORE UPDATE OF lot_id ON
shipments` vérifierait l'existence d'un corridor actif pour
`(shipment.origin_country, shipment.destination_country)` avant d'accepter le
changement. Comme démontré en §4.1/§4.3 avec les autres écritures, `add_shipment_to_lot()`
et `reassign_shipment_lot()` (Migration 2) modifient `lot_id` par un simple `UPDATE`
générique (lignes 447, 507, 612 de `lots_security_core.sql`) — le trigger les intercepte
sans qu'aucune des deux fonctions n'ait besoin d'être modifiée.

**Cas non couvert par le seul trigger sur `lot_id`** : la création même du shipment
(avant tout lot) n'est aujourd'hui soumise à aucune vérification de corridor — retirer le
CHECK `('MA','SN')` au profit d'une FK vers `countries` serait **moins** restrictif que
l'existant (n'importe quelle paire de pays existants deviendrait insérable). Recommandation
: ajouter également un trigger `BEFORE INSERT ON shipments` vérifiant un corridor actif
pour `(NEW.origin_country, NEW.destination_country)` — nouveau trigger, la policy
`shipments_client_insert` (Migration 1) n'est pas touchée.

**Pourquoi pas de `shipments.corridor_id` stocké (validé)** : `origin_country` et
`destination_country` sont déjà stockés sur `shipments` — un `corridor_id` dupliquerait
cette information avec un risque de désynchronisation. Le corridor reste une **règle de
validation consultée**, jamais une donnée redondante.

## 7. Règles de cohérence pays / corridor / organisation

Aucune contrainte ne lie `organizations.country` aux corridors qu'une organisation
dessert — un transporteur basé au Maroc peut légitimement opérer un corridor SN→CI.
`transporters.country_scope` (text[], jamais contraint) reste indépendant ; le faire
pointer vers `countries.code` serait possible mais n'est pas demandé ici (mentionné pour
mémoire, hors périmètre Foundation V1). `organization_id` sur `shipments`/`shipment_lots`
n'a aucune contrainte de cohérence avec `origin_country`/`destination_country`.

## 8. Currency — deux variantes (réponse au point 8)

**Objectif non négociable** : le Core ne doit plus dépendre architecturalement de
`'MAD'`. La question ouverte est *comment* atteindre cet objectif sans inventer une règle
métier non démontrée.

**Variante 1 — devise explicite fournie par l'appelant.** On retire le `DEFAULT 'MAD'`
littéral ; chaque création de shipment doit fournir sa propre devise. *Problème concret
vérifié* : `shipments.currency` est aujourd'hui `NOT NULL` **sans** valeur nullable
possible, et `app/envois/nouveau/page.tsx` n'envoie jamais de champ `currency` — il
compte entièrement sur le défaut SQL. Retirer le défaut sans rien d'autre **casserait
l'insertion existante** (violation NOT NULL) — et corriger cela côté Next.js est
explicitement interdit dans Foundation V1. Cette variante seule n'est donc pas viable
sans violer une autre contrainte du brief.

**Variante 2 — valeur par défaut dérivée des données, via trigger, uniquement en
l'absence de valeur explicite.** Un nouveau trigger `BEFORE INSERT ON shipments`
positionne `NEW.currency := (SELECT default_currency FROM countries WHERE code =
NEW.origin_country)` **seulement si** le client n'a pas fourni de valeur (remplace un
défaut SQL littéral par un défaut calculé, en préservant exactement le comportement
observable actuel). Le flux Next.js existant continue de fonctionner sans modification ;
le jour où un vrai besoin de devise explicite apparaît (ex. un expéditeur choisit EUR),
il suffira que l'appelant fournisse `currency` — le trigger ne s'appliquera alors pas.

**Recommandation : Variante 2.** Pas seulement parce qu'elle est « moins couplée » en
principe, mais parce que c'est la seule qui respecte simultanément (a) l'objectif de
retirer la dépendance à `'MAD'`, (b) la contrainte NOT NULL existante, et (c)
l'interdiction de toucher au Next.js dans cette étape. Ce n'est pas la règle implicite
que tu voulais éviter (« la devise d'un shipment = devise du pays d'origine, point ») —
c'est un filet de compatibilité qui ne s'active qu'en l'absence de choix explicite, et
qui disparaît de lui-même dès qu'un vrai parcours métier fournit une devise.

Aucun moteur de conversion, aucun taux de change, aucun pricing — confirmé hors V1.

## 9. Géographie — confirmé inchangé

Pas de table `cities`, pas de modèle d'adresse structuré. `hubs`/`pickup_points`
restent les seuls référentiels géographiques opérationnels de Foundation V1.

## 10. Flux logistique — confirmé inchangé

Pas de généralisation vers un flux domestique. Aucune modification de
`record_shipment_event()` ni des statuts existants.

## 11. Ordre des triggers (réponse au point 9)

Inventaire réel vérifié en base (`information_schema.triggers`, 7 septembre 2026) :

| Table | Timing | Trigger | Fonction |
|---|---|---|---|
| shipments | BEFORE INSERT | trg_shipments_tracking_code | generate_shipment_tracking_code() |
| shipments | BEFORE UPDATE | trg_prevent_direct_status_change | prevent_direct_status_change() |
| shipments | BEFORE UPDATE | trg_shipments_updated_at | set_updated_at() |
| shipment_lots | BEFORE INSERT | trg_shipment_lots_lot_code | generate_lot_code() |
| shipment_lots | BEFORE UPDATE | trg_prevent_direct_lot_status_change | prevent_direct_lot_status_change() |

Postgres exécute les triggers de même timing/événement par ordre alphabétique de nom.
Les nouveaux triggers proposés (dérivation `organization_id`, validation corridor) ne
lisent que des colonnes que ces 5 triggers existants ne modifient pas
(`assigned_transporter_id`, `current_hub_id`, `current_pickup_point_id`,
`origin_country`, `destination_country`, `status`), et n'écrivent que dans des colonnes
qu'aucun trigger existant ne touche (`organization_id`, `currency` en fallback). **Aucune
dépendance d'ordre réelle n'existe entre les triggers existants et les nouveaux** — mais
par discipline de nommage, les nouveaux triggers seront préfixés `trg_shipments_derive_*`
/ `trg_shipment_lots_derive_*` / `trg_shipments_validate_corridor` pour rester lisibles
dans une inspection `\d shipments` future, sans chercher à forcer un ordre précis qui
n'est pas requis. Le nom exact et l'ordre alphabétique résultant seront figés au SQL
Draft, pas ici.

## 12. Preflight nécessaire avant Migration 5 (réponse au point 10)

Sur le modèle de Migration 4 (avec la correction déjà apprise : comparaisons `LIKE` sur
des fragments significatifs plutôt que des égalités exactes de texte de contrainte, pour
éviter le faux-positif de formatage déjà rencontré) :

- Vérifier que `countries` et `corridors` n'existent pas déjà (`to_regclass`).
- Vérifier la définition exacte des 4 CHECK actuels sur `organizations.country`,
  `hubs.country`, `pickup_points.country`, `shipments.origin_country`/`destination_country`
  (`pg_get_constraintdef`) — abort si le texte ne correspond pas à ce que ce document
  documente, signe d'une dérive du schéma depuis cet audit.
- Vérifier les 5 triggers du §11 par nom exact ET par fonction associée
  (`to_regprocedure` sur chaque fonction).
- Vérifier les signatures exactes de `record_shipment_event`, `create_shipment_lot`,
  `add_shipment_to_lot`, `reassign_shipment_lot`, `can_access_shipment`, `is_admin`
  (`to_regprocedure`).
- Vérifier que `shipments.organization_id` et `shipment_lots.organization_id` n'existent
  pas déjà.
- Vérifier que `shipments.currency` est toujours NOT NULL avec le défaut `'MAD'` exact
  documenté en §8 (sinon la Variante 2 pourrait être appliquée sur une base qui a déjà
  changé entre-temps).

Abort total de la transaction sur tout échec — même discipline que Migration 4.

## 13. Compatibilité avec `can_access_shipment()` (réponse au point 11)

`can_access_shipment()` (Migration 4) vérifie `client_user_id`, `is_admin()`,
`current_pickup_point_id` (via `user_roles.pickup_point_id`), `assigned_transporter_id`
(via `user_roles.transporter_id`) — **aucune référence à `organization_id`**. Foundation
V1 n'ajoute, ne modifie, ni ne supprime de branche dans cette fonction. Compatibilité
totale et triviale : la nouvelle colonne est invisible pour cette fonction, sans
interaction possible.

## 14. Confirmation : aucune policy/fonction/trigger M1-M4 modifié (réponse au point 12)

Confirmé par construction dans ce document : chaque mécanisme proposé (dérivation
tenant, validation corridor, fallback devise) est un **objet nouveau** (2 tables, 2
colonnes nullables, un nombre de triggers à fixer au SQL Draft) qui observe les écritures
existantes sans jamais modifier le corps d'une fonction, le texte d'une policy, ou la
définition d'un trigger appartenant aux Migrations 1 à 4. Aucun `CREATE OR REPLACE
FUNCTION` sur une fonction existante, aucun `ALTER POLICY`, aucun `DROP TRIGGER` sur un
objet des Migrations 1-4 n'apparaît dans cette spécification.

**Point de vigilance additionnel identifié en V1.1** : les grants colonne-par-colonne
actuels sur `shipments` (vérifiés lors de l'audit du 7 septembre) sont explicites par
colonne, pas `SELECT *`. Ajouter la colonne `organization_id` ne la rend **pas**
automatiquement lisible par `authenticated` ou `anon` — il faudrait un `GRANT SELECT
(organization_id) ON shipments TO ...` explicite, absent de cette spécification. C'est un
comportement par défaut sûr (personne ne peut lire cette colonne tant que ce n'est pas
explicitement décidé) — à confirmer intentionnel : Foundation V1 n'a pas besoin
d'exposer `organization_id` via l'API publique pour remplir son rôle de préparation à la
Tenant Isolation.

## 15. Stratégie de migration, backfill, compatibilité

Base réelle actuellement vide (0 ligne partout) — aucun backfill de données n'est
nécessaire aujourd'hui. Stratégie documentée pour référence future : un backfill
recalculerait `organization_id` avec exactement la même logique que les triggers de
dérivation (§4.3), jamais une logique dupliquée. Toutes les nouvelles colonnes sont
nullables ; le passage CHECK→FK sur les 4 colonnes pays est strictement compatible tant
que `countries` contient au moins `'MA'` et `'SN'` dès la même migration.

## 16. Risques

- `arrived_destination` sans `lot_id` (colis jamais rattaché à un lot) : la dérivation via
  le hub de destination du lot est impossible dans ce cas précis — la transition de statut
  n'est PAS bloquée et `organization_id` conserve sa dernière valeur connue plutôt que
  d'être effacé (§4.2, décision explicite pour ne pas introduire une obligation métier
  absente de Migration 1). Cas limite documenté, pas un bug — mais à garder en tête si un
  jour un consommateur suppose `organization_id` toujours à jour au statut exact où il le
  lit.
- `organization_id` = « responsable actuel » seulement : si une future Tenant Isolation a
  besoin d'un historique de participation, `shipment_events` devra être rejoué — signalé,
  pas résolu ici (conforme à ta décision §7 de ne rien créer maintenant).
- Aucune capacité de transfert latéral entre organisations concurrentes n'existe (§4.4) —
  si un jour nécessaire, c'est un nouveau chantier RPC, pas une conséquence de Foundation V1.
- Le fallback devise (§8) dépend de `countries` étant correctement peuplé dès la même
  migration — un `countries` vide au moment de l'exécution romprait le fallback (couvert
  par le preflight §12 si on y ajoute cette vérification au SQL Draft).

## 17. Rollback conceptuel

Toutes les additions sont réversibles sans perte de données (base vide) : `DROP` des 2
nouvelles tables, `DROP` des 2 nouvelles colonnes nullables, `DROP` des nouveaux
triggers, restauration des 4 CHECK d'origine. Aucune fonction/policy des Migrations 1-4
n'étant touchée, aucun rollback n'est nécessaire de leur côté.

## 18. Découpage des futures migrations

- **Migration 5 (Foundation Core V1)** : countries + corridors (MA→SN, SN→MA seedés) +
  FK remplaçant les 4 CHECK + `organization_id` (2 colonnes) + triggers de dérivation
  tenant (scopés sur `status`) + triggers de validation corridor (INSERT + UPDATE OF
  lot_id) + trigger de fallback devise.
- **Migration 6 (hors scope actuel)** : Tenant Isolation — resserrement des policies
  `*_public_read`, uniquement après audit des consommateurs réels.
- Aucune migration de performance ne s'y mêle (séparation stricte avec
  `performance-backlog.md`, confirmée).

## Matrice obligatoire

| Sujet | État actuel | Cible Foundation V1 | Modification nécessaire | Risque |
|---|---|---|---|---|
| Countries | CHECK MA/SN sur 4 tables | Référentiel configurable (code, name, default_currency, active) | Nouvelle table + 4 FK remplaçant les CHECK | Faible |
| Corridors | Implicite (comparaison RPC) | Entité explicite, MA→SN + SN→MA actifs, domestique interdit | Nouvelle table + 2 nouveaux triggers (INSERT shipments, UPDATE OF lot_id) | Faible |
| Shipment tenant | Indirect, ambigu en fin de parcours (§4.1) | organization_id dérivé par statut, jamais sur simple UPDATE | Nouvelle colonne + trigger scopé sur `status` | Faible à moyen (mapping §4.2 partiellement ouvert) |
| Lot tenant | Indirect (via transporter) | organization_id dérivé à la création, jamais recalculé | Nouvelle colonne + trigger BEFORE INSERT | Faible |
| Tenant isolation | Absente | Hors V1 (confirmé) | Migration séparée (6) | N/A |
| Currency | 'MAD' littéral, NOT NULL | Neutre, fallback dérivé de countries, compatible Next.js actuel | Trigger de fallback (Variante 2) | Faible |
| Géographie | Hubs/points relais | Inchangée | Aucune | Nul |
| Flux international | Existant | Conservé | Aucune | Nul |

---

**Fin de la Specification V1.1 — FINALISÉE.** Le mapping tenant (§4.2) a été tranché par
revue humaine, y compris le cas `arrived_destination` (dérivation via le hub de
destination du lot si `lot_id` est renseigné, sinon transition non bloquée et
`organization_id` inchangé — pas d'obligation de lot introduite) et le cas `cancelled`
(conservation de la dernière organisation, aucun recalcul). Une deuxième revue du SQL
Draft a par ailleurs demandé l'ajout de `SET search_path = ''` sur les 6 nouvelles
fonctions plpgsql du Core (cohérence avec le durcissement déjà appliqué aux Migrations
1-4, vérifié compatible car toutes leurs références sont déjà qualifiées `public.*`).
Plus aucune question fonctionnelle en suspens. SQL Draft : voir
`supabase/migrations/20260907150000_foundation_core_v1.sql` — non appliqué, non commité,
en attente d'un GO explicite séparé.
