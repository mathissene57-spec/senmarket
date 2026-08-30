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
À ouvrir directement dans un navigateur — sert de référence visuelle avant
de brancher les vraies pages Next.js (`app/`) au backend Supabase.

## SenLink est un produit séparé de SenMarket

Ce répertoire vit dans le même dépôt git que SenMarket (même précédent que
`flowdynamicsagency-portfolio/`), mais **SenLink est technique­ment et
commercialement un produit distinct** : sa propre app Next.js autonome,
son propre projet Supabase (à provisionner séparément — voir plus bas), son
propre schéma de données. Il ne doit jamais lire ni écrire dans le schéma
Supabase de SenMarket, et inversement. Une intégration future
(commande SenMarket → SenLink → tracking → livraison) est envisagée à
terme, mais les deux produits restent séparés au démarrage.

## Stack

- Next.js 14 (App Router), React 18, TypeScript — mêmes versions que
  SenMarket, mêmes conventions (pas de `src/`, pas de framework CSS,
  objets `style` inline, copie UI en français).
- Supabase (PostgreSQL, Auth, Storage, RLS) — **projet dédié, à créer**,
  distinct de celui de SenMarket.

## Démarrage

```bash
cd senlink
npm install
cp .env.local.example .env.local   # puis renseigner les clés d'un projet Supabase SenLink dédié
npm run dev
```

Le schéma initial est écrit dans
`supabase/migrations/20260829120000_senlink_init_schema.sql` mais **n'est
pas appliqué automatiquement**. Une fois un projet Supabase SenLink
provisionné (décision distincte, potentiellement facturable — non prise
dans ce scaffold), appliquez-le via la CLI Supabase ou l'outil MCP
`apply_migration`.

## Routes

| Route | Description |
|---|---|
| `/` | Landing page + recherche de suivi |
| `/suivi/[code]` | Page de suivi publique (sans authentification) |
| `/envois/nouveau` | Création d'un envoi (coquille) |
| `/login` | Connexion / inscription / lien magique / reset |
| `/dashboard` | Routeur selon le(s) rôle(s) de l'utilisateur |
| `/dashboard/client` | Espace client |
| `/dashboard/agent` | Interface agent point relais |
| `/dashboard/transporteur` | Dashboard transporteur |
| `/dashboard/admin` | Dashboard admin |

## Hors périmètre pour ce scaffold

Volontairement non implémenté à ce stade (cf. l'avertissement du document
de référence : « Ne pas créer inutilement une architecture gigantesque
avant validation terrain ») :

- GPS temps réel / carte live.
- Intégration WhatsApp Business API (le canal existe comme valeur de schéma
  `notifications.channel`, pas de client Twilio/WhatsApp Cloud API).
- Scan QR caméra réel (champs texte en attendant).
- Paiement / calcul de commission.
- Calcul du SenLink Trust Score (`transporters.trust_score` reste `null`).
- Manifeste PWA / service worker.
- Upload réel vers Supabase Storage (colonnes `photo_url` en `text`, pas de
  bucket créé ni de logique d'upload).
- Edge Functions d'envoi de notifications.

Chaque point est marqué `// TODO` dans le code au niveau pertinent.
