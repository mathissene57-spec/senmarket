# Performance Backlog V1 — SenLink

Constats issus de l'audit complet du 7 septembre 2026 (Supabase Advisors, projet réel
`thduksfosaylbjimrgrn`), postérieur à la clôture de Migration 4 (Security Hardening).

## Ce que ce document n'est PAS

- Ce n'est **pas** une liste de failles de sécurité. Aucun des constats ci-dessous n'a été
  identifié comme un problème de sécurité — l'audit du 7 septembre a confirmé que Migration 4
  reste intacte et suffisante à ce jour.
- Ce n'est **pas** une autorisation d'écriture SQL. Aucune modification de schéma, d'index,
  de policy ou de fonction ne doit être faite sur la seule base de ce document.
- Ce n'est **pas** un plan de migration. C'est une liste d'observations à garder en mémoire
  pour une future migration de performance dédiée, si et quand elle devient justifiée.

## Règle d'engagement

**Aucune migration de performance ne doit être écrite ou appliquée sans benchmark préalable
démontrant un problème réel.** Au 7 septembre 2026, le projet SenLink est un squelette vide :
`auth.users = 0`, `shipments = 0`, `incidents = 0`, `shipment_lots = 0`, `user_roles = 0`,
`transporters = 0`, `shipment_lot_locations = 0`. Optimiser des index ou des policies sans
volume réel de données produirait de l'optimisation théorique, pas une amélioration mesurable.

**Ne pas toucher aux Migrations 1 à 4 sans preuve de régression.** Ces migrations sont
verrouillées (voir `CLAUDE.md` racine et l'historique des migrations dans
`supabase/migrations/`). Un constat de performance seul ne constitue jamais une preuve de
régression fonctionnelle ou de sécurité.

## Constats (linter Supabase Performance, 7 septembre 2026)

### 1. Clés étrangères non indexées — priorité basse

Tables concernées : `hubs`, `incidents`, `notifications`, `pickup_points` (×2),
`shipment_events`, `shipment_lot_events` (×2), `shipment_lots` (×3), `shipments` (×3),
`transporters`, `user_roles` (×3).

Impact potentiel : jointures/lookups plus lents sur ces colonnes à mesure que le volume
augmente. Aujourd'hui sans effet mesurable (tables vides).

### 2. `auth_rls_initplan` — priorité basse à moyenne

Tables concernées : `profiles` (×3), `user_roles`, `shipments` (×4), `notifications`,
`shipment_lots`, `shipment_lot_events`, `shipment_lot_locations`, `incidents`.

Certaines policies RLS appellent `auth.uid()` / `auth.role()` (ou une fonction qui en dépend,
comme `is_admin()` ou `can_access_shipment()`) d'une façon qui peut être réévaluée par ligne
plutôt qu'une seule fois par requête. Le correctif standard Postgres/Supabase consiste à
envelopper l'appel dans un `select` scalaire (`(select auth.uid())`) dans la policy. Cela
change le texte des policies existantes — donc soumis à la même règle que toute modification
RLS : preuve du problème (benchmark), pas seulement le signalement du linter.

### 3. Index inutilisés — priorité basse

Tables concernées : `shipments` (×4), `shipment_events`, `incidents`, `notifications`,
`user_roles`, `shipment_lot_locations`.

Attendu tant que la base est vide : un index ne peut pas montrer d'usage sans requêtes réelles
en volume. À réévaluer seulement après un usage réel en production, jamais sur la seule
absence d'usage actuel.

### 4. Policies permissives multiples — priorité basse

Tables concernées : `hubs`, `organizations`, `pickup_points`, `shipment_lots`,
`transporters`, `user_roles` — chacune avec plusieurs policies permissives qui se cumulent
pour une même combinaison rôle/action, ce qui oblige Postgres à évaluer chacune.
Optimisation possible : fusionner certaines policies en une seule avec un `OR` explicite.
Encore une fois, cela touche au texte de policies déjà auditées et verrouillées (Migrations
1 à 4) — à ne considérer qu'avec un besoin démontré.

## Quand revisiter ce backlog

- Quand le Core (Foundation ou autre) commence à recevoir des volumes réels de données
  (comptes, envois, incidents), pas avant.
- Quand un benchmark ou une mesure de production démontre un ralentissement concret
  attribuable à l'un de ces constats.
- Jamais de manière préventive ou théorique sur la seule base de ce document.

Si l'un de ces critères est rempli, ouvrir un nouveau chantier dédié (même protocole que les
Migrations 1 à 4 : audit → spécification → draft SQL → revue humaine → GO explicite →
application → tests → commit/push), jamais un ajout silencieux à une migration existante.
