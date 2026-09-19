# SenLink — Blueprint opérationnel (chantier 2)

> Brouillon de travail issu du document de référence SENLINK
> (FlowDynamicsAgency, août 2026). À valider/amender par le chantier 1
> (étude terrain Casablanca → Dakar) avant toute implémentation MVP réelle
> — voir la section 6 « Questions ouvertes pour le terrain » ci-dessous.

## 1. Cycle de vie officiel d'un colis

| Statut | Libellé FR | Déclenché par (rôle) | Preuve requise |
|---|---|---|---|
| `created` | Créé | Client | — |
| `dropped_off` | Déposé au point relais | Agent point relais | Photo ou scan QR |
| `inspected` | Contrôlé | Agent point relais | Photo ou scan QR |
| `departed_origin` | Départ | Transporteur | — |
| `in_transit_international` | Transit international | Transporteur | — |
| `customs_clearance` | Contrôle douanier | Transporteur / partenaire transit | — |
| `arrived_destination` | Arrivé à destination | Transporteur / hub | Photo ou scan QR |
| `at_hub` | Au hub | Agent hub | — |
| `at_pickup_point` | Au point relais | Agent point relais | Photo ou scan QR |
| `out_for_delivery` | En cours de livraison | Transporteur / livreur | — |
| `delivered` | Livré | Agent point relais / livreur | Photo ou scan QR, ou OTP |
| `incident` | Incident | Tout rôle opérationnel | Photo + commentaire |
| `cancelled` | Annulé | Client / admin | — |

Ce tableau reflète le CHECK constraint de `shipments.status` et la liste
`STATUSES_REQUIRING_PROOF` dans `lib/shipment-status.ts` — les deux doivent
rester synchronisés.

## 2. Événements obligatoires par statut critique

Pour chaque statut marqué « preuve requise » ci-dessus, `shipment_events`
doit contenir (section 3 du document source) :

- `timestamp` (auto)
- `shipment_id`
- `event_type`
- `actor_user_id` + `actor_role`
- `location_text` / `location_lat` / `location_lng`
- `device_info` (métadonnées de l'appareil ayant fait le scan)
- `photo_url` et/ou `qr_scan_ref`

C'est la fonction `record_shipment_event()` (voir la migration SQL) qui
applique cette règle : elle refuse d'enregistrer un changement de statut
critique sans `photo_url` ni `qr_scan_ref`.

## 3. Rôles et permissions

| Capacité | Client | Agent point relais | Transporteur | Admin |
|---|---|---|---|---|
| Créer un envoi | ✅ | — | — | ✅ |
| Suivre ses propres colis | ✅ | — | — | ✅ |
| Voir les colis de son point relais | — | ✅ | — | ✅ |
| Voir les colis qui lui sont assignés | — | — | ✅ | ✅ |
| Scanner / enregistrer un événement | — | ✅ | ✅ | ✅ |
| Déclarer un incident | ✅ | ✅ | ✅ | ✅ |
| Gérer transporteurs / points relais / hubs | — | — | — | ✅ |
| Voir tous les colis / analytics / audit logs | — | — | — | ✅ |

Un même utilisateur peut cumuler plusieurs rôles (`user_roles` n'a pas de
contrainte d'unicité par utilisateur, seulement par `(user_id, role,
organization_id)`).

## 4. Gestion des exceptions et incidents

Types (section 12 du document source) : `colis_endommage`,
`colis_manquant`, `retard`, `probleme_douanier`, `mauvaise_adresse`,
`destinataire_absent`, `autre`.

Cycle de vie d'un incident : `open` → `investigating` → `resolved` →
`closed`. Chaque déclaration exige : photo, commentaire (`description`),
localisation, acteur (`reported_by`), horodatage.

## 5. Preuves et audit

- Ce qui compte comme preuve : une photo (URL Supabase Storage — bucket à
  créer, non fait dans ce scaffold) ou un scan QR (`qr_scan_ref`).
- `shipment_events` est append-only : aucune politique RLS `UPDATE`/`DELETE`
  n'existe sur cette table, et l'unique voie d'insertion est
  `record_shipment_event()` (`SECURITY DEFINER`).
- `shipments.status` ne peut être modifié en dehors de cette fonction — un
  trigger (`prevent_direct_status_change`) le bloque explicitement.

## 6. Questions ouvertes pour le terrain (chantier 1)

Reprises telles quelles de la section 14 du document de référence — tant
que ces réponses terrain n'existent pas, ce blueprint reste une hypothèse
de travail, pas une vérité opérationnelle :

- Comment les colis sont-ils actuellement collectés ?
- Qui les transporte réellement ?
- Comment sont-ils regroupés ?
- Comment passent-ils les frontières ?
- Comment fonctionne le dédouanement en pratique ?
- Où se produisent les pertes ?
- Où se produisent les retards ?
- Comment les clients paient-ils aujourd'hui ?
- Comment les destinataires récupèrent-ils leurs colis ?
- Qui assume la responsabilité à chaque étape ?
