# SenLink — Spécification fonctionnelle du rôle Transporteur

> Document de référence pour le rôle `transporteur`, écrit après coup à partir de ce qui
> est **réellement construit et verrouillé** : Migrations 1 (Security Core), 2 (Lots
> Security Core) et 3 (GPS Location Tracking Core), toutes appliquées et vérifiées sur le
> projet Supabase de production (`thduksfosaylbjimrgrn`), et `senlink/prototype-transporteur.html`
> (prototype UX statique, aucun appel Supabase réel).
>
> Légende utilisée dans chaque section :
> - 🔒 **Backé par une vraie RPC/RLS** — le comportement décrit correspond exactement à une
>   fonction ou une politique appliquée en base.
> - 🧪 **Illustratif / démo uniquement** — le prototype simule ce comportement côté client
>   (`localStorage`, JS), mais aucune RPC ni politique réelle ne l'implémente aujourd'hui.
>   Ne jamais coder une vraie page contre ces comportements sans d'abord construire la
>   migration correspondante.

## 0. Identité et rôle

Un utilisateur est reconnu comme transporteur via `user_roles` : une ligne avec
`role = 'transporteur'` et `transporter_id` renseigné (référence `transporters.id`). Un même
utilisateur peut cumuler plusieurs rôles (`user_roles` n'a pas de contrainte d'unicité par
utilisateur). Toutes les RPC d'écriture du rôle transporteur (voir plus bas) exigent en plus
un paramètre explicite `p_acting_role = 'transporteur'` — un administrateur qui appelle la
même RPC est explicitement rejeté (`is_admin()` vérifié et bloqué avant même le contrôle de
rôle), sauf pour les deux RPC de lecture qui acceptent aussi l'admin en lecture seule
(`get_lot_reconciliation`, `get_lot_last_location`, `get_lot_location_history`). 🔒

Le prototype ne fait aucun appel `auth.*` réel : `ST.page`/les données de démo vivent dans
`localStorage`, sans notion de session ou d'identité Supabase. 🧪

---

## 1. Vue d'ensemble (Accueil)

**Données affichées**
- KPI (`renderKpis()`) : colis en transit, colis à prendre en charge (contrôlés, sans lot),
  lots en transport, incidents ouverts, colis livrés, taux de livraison (%).
- Panneau « À faire maintenant » (`renderTodo()`) : colis contrôlés non rattachés à un lot,
  incidents non traités, lots `open` avec leur nombre de colis rattachés.
- Liste des lots en cours (statuts `open`/`in_transit`).

**Actions autorisées** : naviguer vers Colis / Incidents / Scanner, ouvrir directement la
sheet d'un lot depuis le panneau « À faire ».

**Statuts concernés** : lecture agrégée de `shipments.status` et `shipment_lots.status`,
aucune écriture.

**Événements générés** : aucun — écran 100% lecture.

**Permissions RLS** 🔒 : `shipments_client_select` (branche transporteur :
`user_roles.transporter_id = shipments.assigned_transporter_id`), `shipment_lots_transporteur_read`
(`user_roles.transporter_id = shipment_lots.transporter_id`).

**Validations** : aucune (écran de lecture).

**Parcours mobile** : page par défaut à l'ouverture de l'app (`ST.page = 'accueil'`), premier
onglet de la barre de navigation basse.

---

## 2. Colis

**Données affichées** : liste des colis assignés au transporteur, filtrable
(`COLIS_FILTERS`) : Tous / À prendre en charge / En transit / Arrivés / Livrés. Recherche par
code de suivi. Sheet détail par colis : statut, route, timeline complète, métadonnées
(poids, catégorie, valeur déclarée).

**Actions autorisées** : consulter le détail d'un colis. Aucune action d'écriture depuis cet
écran — les transitions de statut passent exclusivement par Scanner.

**Statuts concernés** : tous les statuts de `shipments.status` compris entre `inspected` et
`delivered` (le transporteur ne voit que les colis qui lui sont déjà assignés, jamais
`created`/`dropped_off` côté agent point relais).

**Événements générés** : aucun.

**Permissions RLS** 🔒 : `shipments_client_select`, branche transporteur.

**Validations** : aucune.

**Parcours mobile** : deuxième onglet de la barre basse ; recherche + filtres sticky en haut
de la liste.

---

## 3. Scanner

**Données affichées** : code scanné/saisi, colis résolu (route, statut actuel), transitions
disponibles pour ce statut, indicateur "preuve requise" si applicable.

**Actions autorisées** : faire progresser un colis d'un statut vers le suivant, uniquement
selon la machine à états réduite au rôle transporteur :

| Statut actuel | Transition(s) autorisée(s) pour `transporteur` |
|---|---|
| `inspected` | → `departed_origin` |
| `departed_origin` | → `in_transit_international` |
| `in_transit_international` | → `customs_clearance` ou → `arrived_destination` |
| `customs_clearance` | → `arrived_destination` |

Ce sous-ensemble est un **sous-graphe strict** de la machine à états complète
`is_valid_transition()` (Migration 1) — le rôle transporteur ne peut pas déclencher les
transitions réservées à l'agent point relais (`dropped_off`, `at_pickup_point`, `delivered`,
etc.), même si `record_shipment_event()` les accepterait techniquement pour un autre rôle.

**Statuts concernés** : voir tableau ci-dessus. `PROOF_REQUIRED = ['arrived_destination']` :
seule cette transition exige une preuve (photo) côté rôle transporteur — les preuves exigées
pour `dropped_off`/`inspected`/`at_pickup_point`/`delivered` relèvent d'autres rôles.

**Événements générés** 🔒 : un appel à `record_shipment_event(p_shipment_id, p_new_status,
p_acting_role:='transporteur', p_photo_url, p_device_info, p_metadata, ...)`. Cette RPC
(Migration 1, `SECURITY DEFINER`) : verrouille la ligne colis (`FOR UPDATE`), revalide la
transition côté serveur via `is_valid_transition()` (jamais une confiance aveugle au client),
exige `photo_url` non nul pour les statuts de `PROOF_REQUIRED` réel côté base, insère un
événement dans `shipment_events` (append-only, aucune policy UPDATE/DELETE), puis met à jour
`shipments.status` via le déclencheur `set_config('app.via_record_event', ...)` — jamais un
`UPDATE` direct de statut, bloqué par un trigger dédié.

**Permissions RLS** 🔒 : `shipments_ops_update` (branche transporteur), `EXECUTE` sur
`record_shipment_event` : `anon = false`, `authenticated = true`.

**Validations** 🔒 : transition invalide → exception serveur (jamais un échec silencieux) ;
preuve manquante sur un statut qui l'exige → exception serveur, même si le client omettait
la vérification.

**Parcours mobile** : accessible via bouton flottant (FAB scan) ou onglet dédié ; flux en 2
étapes (scan/saisie du code → sélection de la transition + preuve si requise).

---

## 4. Lots — écran central du rôle transporteur

C'est l'écran qui concentre la quasi-totalité de la logique métier propre au transporteur
(Migration 2). Un **lot** est l'unité de transport groupé entre deux hubs.

**Données affichées** : liste des lots (filtrable par statut — Tous/Ouverts/En
transit/Arrivés/Clôturés), code de lot généré automatiquement (`generate_lot_code()`,
format `LOT-{origine}-{destination}-{date}-{aléatoire}`), route (hub origine → hub
destination), nombre de colis, poids total, dates création/départ/arrivée. Sheet détail par
lot, contenu dépendant du statut (voir plus bas). Carte GPS intégrée (section 4bis).

**Actions autorisées, par statut du lot :**

| Statut | Actions disponibles | RPC 🔒 |
|---|---|---|
| `open` | Créer le lot ; ajouter un colis éligible (même paire origine/destination, statut `inspected`, sans lot) ; retirer un colis ; consulter la checklist de départ ; confirmer le départ ; annuler le lot s'il est vide | `create_shipment_lot`, `add_shipment_to_lot`, `remove_shipment_from_lot`, `declare_lot_departure`, `cancel_empty_lot` |
| `in_transit` | Consulter les colis du lot ; déclarer l'arrivée ; consulter la position GPS en direct (🧪 simulée, voir 4bis) | `declare_lot_arrival` |
| `arrived` | Enregistrer la réconciliation (attendu vs reçu, écart) ; clôturer le lot une fois réconcilié | `record_lot_reconciliation`, `close_shipment_lot` |
| `closed` | Consultation seule (colis, historique) | — |

**Décision de cadrage** 🔒 : `reassign_shipment_lot()` (déplacer un colis d'un lot à un
autre) est disponible et sécurisée côté base, mais non exposée dans l'interface transporteur
actuelle. Cette absence est traitée comme volontaire à ce stade, pas comme un oubli à
corriger automatiquement — une capacité backend verrouillée ne devient une fonctionnalité
produit que sur décision explicite, pas par défaut. Aucun bouton n'est donc ajouté dans le
prototype tant que le besoin terrain ne l'a pas justifié.

**Statuts concernés** : `shipment_lots.status ∈ {open, in_transit, arrived, closed}`, machine
à états stricte (`is_valid_lot_transition()`, Migration 2) : `open → in_transit → arrived →
closed`, aucun saut, aucun retour en arrière possible. Le passage à `in_transit`
(`declare_lot_departure`) fait aussi progresser chaque colis du lot vers `departed_origin` en
réutilisant `record_shipment_event()` (aucune logique de transition dupliquée).

**Événements générés** 🔒 : chaque action ci-dessus insère une ligne dans
`shipment_lot_events` (append-only) avec un `event_type` parmi `lot_created`,
`shipment_added`, `shipment_removed`, `lot_departed`, `lot_arrived`, `arrival_reconciled`,
`lot_closed`.

**Permissions RLS** 🔒 : `shipment_lots_transporteur_read` (lecture), `SELECT` uniquement sur
`shipment_lots`/`shipment_lot_events` — aucune écriture directe possible, seule porte
d'entrée = les RPC ci-dessus (`SECURITY DEFINER`, `EXECUTE` refusé à `anon`, accordé à
`authenticated`).

**Validations** 🔒, imposées côté serveur (jamais seulement côté client) : cohérence
géographique (le colis ajouté doit partager pays d'origine/destination avec le lot),
`FOR UPDATE` + verrouillage en ordre déterministe pour éviter tout deadlock, checklist de
départ obligatoire avant `declare_lot_departure` (tous les colis `inspected`, aucun incident
ouvert bloquant), réconciliation bloquée en double exécution (vérifie qu'aucun événement
`arrival_reconciled` n'existe déjà).

**Parcours mobile** : troisième onglet ; sheet bas-de-page (bottom sheet) pour le détail d'un
lot, avec bouton "📋 Voir le manifeste" toujours visible en haut de la sheet.

### 4bis. Carte GPS du lot 🧪 (V1 démo)

Intégrée directement dans la sheet Lot, avec 4 états qui suivent le statut du lot :
- `open` → trajet prévu (route statique, pas de position).
- `in_transit` → position simulée en direct, rafraîchie toutes les 10 s, vitesse/précision
  simulées, badge "MODE DÉMO" visible.
- `arrived`/`closed` → dernière position simulée figée (ou message honnête si le lot n'a
  jamais été suivi en direct dans la session en cours).

Le vrai backend existe et est verrouillé (Migration 3 : table `shipment_lot_locations`,
RPC `record_lot_location()`/`get_lot_last_location()`/`get_lot_location_history()`, écriture
uniquement pendant `status = 'in_transit'`), mais **le prototype ne l'appelle jamais** —
toute la position affichée est générée côté client (`GPS_DEMO`), avec un commentaire
`// DEMO ONLY` explicite dans le code. Rendu via une vraie carte Leaflet/OpenStreetMap
(CartoDB Positron) avec repli automatique sur une barre stylisée si la librairie externe ne
charge pas.

---

## 5. Manifeste (sous-vue de Lots)

**Données affichées** : document récapitulatif d'un lot — transporteur, statut, nombre de
colis, poids total, dates clés, liste des colis avec destinataire/poids/statut.

**Actions autorisées** : imprimer / exporter en PDF (`window.print()`).

**Statuts concernés** : disponible pour un lot dans n'importe quel statut.

**Événements générés** : aucun — c'est une **projection documentaire**, jamais une entité
stockée séparément (décision explicite prise pendant la conception de Migration 2 : pas de
table `manifestes`).

**Permissions RLS** : identiques à l'écran Lots (mêmes données sous-jacentes, aucune
politique propre).

**Parcours mobile** : ouverte depuis la sheet Lot ; ferme automatiquement la sheet Lot
sous-jacente pour éviter l'empilement visuel.

---

## 6. Incidents

**Données affichées** : liste filtrable (Tous/Ouverts/Résolus), détail par incident (type,
description, déclarant + rôle, colis concerné, preuve photo, position GPS 🧪 — voir plus
bas).

**Actions autorisées** :
- Déclarer/consulter un incident (types : `colis_manquant`, `colis_endommage`,
  `colis_ouvert`, `mauvaise_destination`, `retard`, `probleme_documentaire`,
  `refus_reception`, `probleme_douane`, `probleme_transport`, `probleme_point_relais`,
  `autre`).
- 🧪 **Marquer un incident comme résolu** — bouton présent dans le prototype, mais **aucune
  RPC réelle ne l'implémente**. Le schéma réel (`incidents_admin_update`) ne permet
  aujourd'hui la résolution qu'à un administrateur, pas au transporteur. Ce bouton anticipe
  un futur "Incidents V2" (RLS/RPC dédiées) explicitement hors périmètre de Migration 2 — ne
  pas le considérer comme déjà backé.

**Statuts concernés** 🧪 : trois niveaux à ne pas confondre, aucun n'étant aujourd'hui
contractuel :
  - `docs/blueprint.md` (section 4) est une **référence conceptuelle** : cycle à 4 états
    (`open → investigating → resolved → closed`).
  - `prototype-transporteur.html` est une **démonstration actuelle** : cycle à 2 états
    (`open`/`resolved`), plus simple que la référence conceptuelle.
  - Le backend réel n'a **pas encore de workflow incidents canonique** — aucune migration
    incidents n'a été conçue ni verrouillée à ce jour, contrairement aux Migrations 1-3.

Ces trois niveaux divergent délibérément tant qu'aucune décision n'a été prise ; le choix
entre 2 et 4 états (ou autre chose) reste ouvert pour un futur round de conception dédié.
**Aucune conclusion de sécurité ou de permissions RLS ne doit être tirée du comportement du
prototype actuel** — celui-ci ne reflète aucune politique réelle sur cet écran.

**Événements générés** : aucun événement réel — la résolution modifie seulement l'objet en
mémoire (`localStorage`).

**Permissions RLS** : aucune vérifiée en base pour cet écran (pas de migration incidents
verrouillée à ce jour).

**Position GPS sur un incident** 🧪 : résout `incident → shipmentCode → shipment.lotId → lot`,
puis réutilise exactement la même simulation que l'écran Lots (`GPS_DEMO`, jamais une
donnée séparée). Trois cas honnêtes : pas de lot rattaché → message explicite ; lot encore
`open` → "pas encore en transit à cette date" ; lot `in_transit`/`arrived`/`closed` avec
historique de session → carte affichée avec badge démo. Aucune colonne
`location_lat`/`location_lng` réelle n'est supposée exister sur une éventuelle table
`incidents`.

**Parcours mobile** : quatrième onglet ; sheet détail avec formulaire de résolution en bas
si l'incident est ouvert.

---

## 7. Planning

**Données affichées** : agenda dérivé des dates réelles des lots (création, départ,
arrivée) — `renderPlanning()` construit les entrées uniquement à partir de
`shipment_lots.created_at/departed_at/arrived_at`, trié chronologiquement (le plus récent en
tête), groupé par jour.

**Actions autorisées** : consultation seule ; clic sur une entrée → ouvre la sheet du lot
concerné.

**Statuts concernés** : lecture agrégée, aucun statut propre.

**Événements générés** : aucun.

**Permissions RLS** : identiques à Lots (mêmes données sous-jacentes).

**Validations** : aucune entité de calendrier indépendante n'existe dans le modèle — pas de
saisie manuelle possible ici, volontairement.

**Parcours mobile** : accessible depuis la barre desktop et depuis le menu Profil sur
mobile (pas d'onglet dédié dans la barre basse, pour ne pas la surcharger).

---

## 8. Équipe 🧪 (entièrement illustratif)

**Données affichées** : liste de 5 membres fictifs (`SEED_TEAM`) avec des rôles granulaires
spéculatifs (ex. "Chauffeur", "Coordinateur hub").

**Actions autorisées** : "Inviter un membre" — stub, affiche uniquement un toast, aucune
action réelle.

**Statuts / événements / RLS / validations** : **aucun** — ni `user_roles` multi-membres par
transporteur, ni notion d'équipe, ni RPC d'invitation n'existe dans le schéma réel. Le
prototype porte une "NOTE DE CONCEPTION" visible à l'écran et un commentaire de code
équivalent pour ne jamais laisser croire que cette fonctionnalité est backée.

**Parcours mobile** : accessible depuis la barre desktop et depuis le menu Profil sur mobile.

---

## 9. Profil

**Données affichées** : identité (nom fictif "Atlas Cargo — Transporteur" dans le prototype),
menu d'accès à Planning/Équipe (mobile), bouton de réinitialisation des données de démo.

**Actions autorisées** : réinitialiser les données de démo (`resetDemo()` — recharge
`SEED_SHIPMENTS`/`SEED_LOTS`/`SEED_INCIDENTS` dans `localStorage`, jamais un vrai reset
serveur).

**Statuts / événements / RLS** : sans objet, écran de navigation/démo uniquement.

**Parcours mobile** : dernier onglet de la barre basse.

---

## 10. Synthèse — ce qui est réellement backé vs illustratif

| Écran / fonctionnalité | Statut |
|---|---|
| Authentification par rôle (`user_roles.transporter_id`) | 🔒 réel |
| Scanner → transitions de statut colis | 🔒 réel (`record_shipment_event`) |
| Lots → cycle de vie complet (création → départ → arrivée → réconciliation → clôture) | 🔒 réel (Migration 2, 10 RPC) |
| Manifeste | 🔒 réel (projection des mêmes données que Lots, pas de nouvelle entité) |
| Carte GPS (Lots et Incidents) | 🧪 démo — le vrai GPS Core (Migration 3) existe et est verrouillé mais n'est jamais appelé |
| Résolution d'incident par le transporteur | 🧪 démo — le schéma réel réserve cette action à un admin |
| Cycle de statut des incidents (2 vs 4 états) | 🧪 démo — aucune migration incidents verrouillée, deux documents divergents |
| Équipe (liste, invitation) | 🧪 entièrement fictif, aucun schéma |
| Réassignation d'un colis entre lots (`reassign_shipment_lot`) | 🔒 backé en base mais **non exposé** dans l'UI actuelle |

Aucune de ces zones 🧪 ne doit être considérée comme une spécification figée pour une future
implémentation réelle sans passer par le même processus de conception que les Migrations
1 à 3 (relecture du schéma réel, décisions explicites, brouillon SQL relu, feux verts
séparés écriture/application).
