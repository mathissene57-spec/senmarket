# SenLink

> « La couche numérique de confiance du corridor logistique Maroc–Sénégal. »

SenLink est une plateforme de logistique et de tracking de colis pour le
corridor Maroc ↔ Sénégal (pilote : Casablanca → Dakar). Ce n'est ni une
simple application de tracking, ni un nouveau transporteur : chaque étape
d'un colis (dépôt, contrôle, transport, douane, hub, point relais,
livraison) génère un événement numérique traçable et une preuve.

Voir `docs/blueprint.md` pour le cycle de vie détaillé des colis, les
rôles/permissions et la liste des questions terrain encore ouvertes.

## Prototype UX (`prototype.html`)

`prototype.html` est un prototype HTML/CSS/JS autonome (sans framework, sans
étape de build) montrant tout le parcours client : accueil, suivi d'un
colis avec timeline complète, création d'un envoi (avec QR de démo),
historique, profil, signalement d'incident, candidature partenaire. Il
couvre aussi l'expérience destinataire (code de retrait révélé uniquement
sur la page de suivi, jamais côté agent) et une simulation d'écran agent
(accessible depuis Profil) qui exige preuve photo et code de retrait avant
de faire passer un colis à « Livré » — miroir volontairement simplifié des
règles de Migration 1 (jamais appliquée). Les statistiques d'accueil sont
recalculées en direct depuis les colis de démonstration et explicitement
labellisées comme telles, plutôt que des constantes inventées. Données
codées en dur, persistance uniquement via `localStorage`, **aucun appel
réseau/Supabase**. Même précédent que le prototype SenMarket (`README.md` à
la racine du dépôt), mais écrit proprement (pas de guillemets typographiques
ni de tiret cadratin corrompant les `var(--x)` CSS comme dans ce dernier).
À ouvrir directement dans un navigateur — sert de référence visuelle.

**Statut** : la vraie app Next.js (`app/`) est maintenant branchée à un
projet Supabase réel et en production (voir plus bas) — les tableaux de
bord client/agent/transporteur/admin y sont largement plus avancés que ce
prototype. Deux choses du prototype n'ont en revanche **aucun équivalent
réel** : la candidature partenaire et le scan QR caméra (voir « Hors
périmètre » plus bas).

## SenLink est un produit séparé de SenMarket

Ce répertoire vit dans le même dépôt git que SenMarket (même précédent que
`flowdynamicsagency-portfolio/`), mais **SenLink est technique­ment et
commercialement un produit distinct** : sa propre app Next.js autonome,
son propre projet Supabase (provisionné et en production — voir plus bas),
son propre schéma de données. Il ne doit jamais lire ni écrire dans le
schéma Supabase de SenMarket, et inversement. Une intégration future
(commande SenMarket → SenLink → tracking → livraison) est envisagée à
terme, mais les deux produits restent séparés au démarrage.

## Stack

- Next.js 14 (App Router), React 18, TypeScript — mêmes versions que
  SenMarket, mêmes conventions (pas de `src/`, pas de framework CSS,
  objets `style` inline, copie UI en français).
- Supabase (PostgreSQL, Auth, Storage, RLS) — projet dédié `senlink`
  (ref `thduksfosaylbjimrgrn`), distinct de celui de SenMarket, **en
  production** : schéma appliqué, RLS active sur toutes les tables,
  données réelles (colis, événements, positions GPS).
- Déployé sur Vercel (projet git-lié, build depuis cette branche) —
  accessible sur `senlink.vercel.app`. `leaflet` (`components/LiveMap.tsx`)
  pour la carte de suivi GPS en direct (OpenStreetMap, sans clé API).

## Démarrage

```bash
cd senlink
npm install
cp .env.local.example .env.local   # renseigner NEXT_PUBLIC_SUPABASE_URL et
                                    # NEXT_PUBLIC_SUPABASE_ANON_KEY du projet
                                    # Supabase "senlink" (thduksfosaylbjimrgrn)
npm run dev
```

Le schéma vit dans `supabase/migrations/` (un fichier par évolution,
appliqué via l'outil MCP `apply_migration` ou la CLI Supabase — jamais à la
main dans le dashboard). Toute nouvelle migration doit être écrite en
fichier ET appliquée au projet réel, les deux à la fois : un fichier non
appliqué ne sert que de trace, une application sans fichier n'est pas
traçable.

## Routes

| Route | Description |
|---|---|
| `/` | Landing page + recherche de suivi |
| `/suivi` | Formulaire de recherche d'un colis par code |
| `/suivi/[code]` | Page de suivi publique (sans authentification), code de retrait affiché à `at_pickup_point` |
| `/envois/nouveau` | Création d'un envoi, avec upload photo optionnel |
| `/login` | Connexion / inscription / lien magique / reset |
| `/dashboard` | Routeur selon le(s) rôle(s) de l'utilisateur |

| Espace client | Description |
|---|---|
| `/dashboard/client` | Accueil espace client |
| `/dashboard/client/historique` | Ses colis, avec lien vers le suivi GPS en direct si en transit |
| `/dashboard/client/suivi-gps/[lotId]` | Carte en direct de son colis en transit |
| `/dashboard/client/incidents` | Signaler et suivre un incident sur ses colis |
| `/dashboard/client/notifications` | Notifications in-app (une par changement de statut) |
| `/dashboard/client/points-relais` | Annuaire des points relais actifs |

| Espace agent point relais | Description |
|---|---|
| `/dashboard/agent` | Accueil espace agent |
| `/dashboard/agent/point-relais` | Recherche d'un colis par code, dépôt/contrôle/remise avec preuve photo + OTP |
| `/dashboard/agent/hub` | Réception/expédition au niveau hub |

| Espace transporteur | Description |
|---|---|
| `/dashboard/transporteur` | Accueil espace transporteur |
| `/dashboard/transporteur/lots`, `/departs`, `/arrivees` | Gestion des lots de colis |
| `/dashboard/transporteur/scans` | Scan d'étape avec preuve photo |
| `/dashboard/transporteur/gps` | Partage automatique de la position pendant qu'un lot est en transit |
| `/dashboard/transporteur/colis`, `/manifestes`, `/planning`, `/performance`, `/equipe`, `/profil`, `/incidents` | Suivi opérationnel et gestion d'équipe |

| Espace admin | Description |
|---|---|
| `/dashboard/admin` | Accueil espace admin |
| `/dashboard/admin/colis`, `/flux`, `/analytics`, `/audit` | Vue globale, flux Maroc/Sénégal, analytics, journal d'audit |
| `/dashboard/admin/hubs`, `/points-relais`, `/transporteurs` | Gestion (création + activation/désactivation) du réseau |
| `/dashboard/admin/incidents`, `/retards` | Suivi des incidents et retards |
| `/dashboard/admin/gps` (+ `/[lotId]`) | Suivi GPS en direct de tous les lots en transit |

## Hors périmètre

Écarts encore réels avec la vision produit du document de référence — pas
des TODO ponctuels, des chantiers pas commencés :

- **Intégration WhatsApp Business API / SMS** : `notifications.channel`
  accepte `whatsapp`/`sms`/`email`/`push` en plus de `in_app`, mais aucun
  client Twilio/WhatsApp Cloud API n'existe. Seules les notifications
  `in_app` sont réellement envoyées (déclenchées par un trigger sur
  `shipment_events`, voir migration `notify_client_on_shipment_status_change`).
- **Paiement / calcul de commission** : aucune trace dans le schéma —
  décision produit (fournisseur, modèle de commission) à prendre avant
  toute implémentation.
- **Calcul du SenLink Trust Score** (`transporters.trust_score` reste
  `null`, affiché `—` dans le dashboard admin) — la formule (facteurs,
  pondération) est une décision produit, pas encore prise.
- **Manifeste PWA / service worker** : pas de mode hors-ligne pour les
  agents/transporteurs terrain.
- **Candidature partenaire** : existe dans `prototype.html`, aucune route
  équivalente dans `app/`.
- **Scan QR caméra** : réellement implémenté (composants `QrScanner` /
  `ShipmentQrCode`, jsQR + génération QR sur `/suivi/[code]` et
  `/envois/nouveau`) — l'agent point relais peut scanner le QR d'un colis
  pour le retrouver, ce qui renseigne `qr_scan_ref` en plus de la photo.
  **Point non tranché** : `record_shipment_event()` contient le
  commentaire explicite "le QR n'est jamais une preuve" et exige toujours
  une photo aux statuts critiques, alors que `docs/blueprint.md` (section 1,
  citant le document de référence) affirme que la preuve requise est
  "Photo **ou** scan QR". Cette contradiction n'a pas été résolue — la
  règle actuellement appliquée est "photo obligatoire, QR en plus" tant
  qu'une décision produit explicite ne dit pas le contraire.
- **Multi-organisation** : le schéma le permet (`organizations`,
  `organization_id` un peu partout) mais aucune UI ne le gère — un seul
  pilote, une seule organisation en pratique aujourd'hui.
- **Étude terrain (chantier 1 du document de référence)** : jamais menée.
  Voir `docs/blueprint.md` section 6 — tant qu'elle n'a pas eu lieu, le
  cycle de vie codé ici reste une hypothèse de travail, pas une vérité
  opérationnelle validée sur le terrain.
