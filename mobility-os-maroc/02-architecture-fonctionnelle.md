# Étape 2 — Architecture fonctionnelle

Point de départ : Option A validée (le partenaire de samedi est lui-même le premier opérateur pilote). Ce document détaille les parcours, le dispatch, la cartographie, le modèle multi-opérateur et l'architecture technique. Les points **[À VALIDER]** sont des hypothèses de travail prises pour avancer vite jusqu'à samedi ; ils sont raisonnables mais pas définitifs.

**[À VALIDER]** — hypothèses de cadrage reprises des questions ouvertes de l'Étape 1 : la démo couvre une seule ville, VTC uniquement (pas de livraison colis au MVP — l'architecture de données n'interdit pas de l'ajouter plus tard, voir §6, mais rien n'est construit pour ça maintenant).

## 1. Parcours Passager

| # | Écran | Contenu / action | Sortie |
|---|---|---|---|
| 1 | Connexion | Numéro de téléphone → code OTP reçu par SMS | Compte créé/reconnu |
| 2 | Carte / accueil | Position actuelle détectée, champ "Où allez-vous ?" | Saisie destination |
| 3 | Confirmation trajet | Départ + arrivée sur carte, distance, prix estimé, délai estimé | Bouton "Commander" |
| 4 | Recherche chauffeur | Écran d'attente ("recherche d'un chauffeur…"), annulation possible | Chauffeur assigné ou timeout |
| 5 | Course en cours | Position du chauffeur en approche puis en course sur la carte, nom/véhicule/téléphone du chauffeur, statut (arrive dans Xmin → à bord → en route) | Fin de course |
| 6 | Fin de course | Récapitulatif prix, confirmation paiement cash, notation du chauffeur (étoiles + commentaire optionnel) | Retour à l'accueil |
| 7 | Historique | Liste des courses passées avec prix et date | — |

Cas d'échec à couvrir dès le MVP : aucun chauffeur disponible dans le rayon (message clair + réessayer), annulation par le passager avant assignation, annulation par le chauffeur après assignation (relance automatique du dispatch sur le chauffeur suivant).

## 2. Parcours Chauffeur

| # | Écran | Contenu / action | Sortie |
|---|---|---|---|
| 1 | Connexion | Téléphone + OTP | Compte reconnu (créé côté dashboard Opérateur, pas d'auto-inscription libre — voir §3) |
| 2 | Accueil | Toggle disponible/indisponible, carte, gains du jour | Attente de course si disponible |
| 3 | Notification course | Fiche demande : point de départ, distance approximative, prix estimé ; accepter/refuser, timeout ~15-20s | Course assignée ou passe au chauffeur suivant |
| 4 | Navigation vers passager | Itinéraire (lien vers appli de navigation externe, cf §5), bouton "Je suis arrivé" | Passage à "passager à bord" |
| 5 | Course en cours | Bouton "Terminer la course" à l'arrivée | Écran de fin |
| 6 | Fin de course | Récapitulatif, montant ajouté à l'historique de gains | Retour à l'accueil |
| 7 | Historique | Courses effectuées, gains cumulés (jour/semaine) | — |

**[À VALIDER]** : au MVP, les comptes chauffeurs sont créés par l'Opérateur depuis son dashboard (pas d'auto-inscription publique) — cohérent avec le fait qu'un opérateur a une flotte connue, et ça évite de construire un flux de vérification d'identité chauffeur pour la démo.

## 3. Dashboard Opérateur

- **Vue d'ensemble** : courses du jour/semaine, chiffre d'affaires agrégé, nombre de chauffeurs actifs — les chiffres que l'opérateur montre à son propre patron.
- **Chauffeurs** : liste (nom, téléphone, véhicule, statut), création d'un compte chauffeur, activation/désactivation.
- **Zones et tarifs** : définir une ou plusieurs zones de service, prix de base + prix au kilomètre par zone.
- **Courses** : vue temps réel des courses en cours (statut, chauffeur, passager) + historique filtrable par date/statut/chauffeur.
- **Marque** : upload logo, choix des deux couleurs principales, nom affiché aux passagers/chauffeurs — c'est la vitrine du modèle white-label, elle doit être démontrée samedi même si le reste du dashboard reste simple.

## 4. Système de dispatch

Logique volontairement simple pour le MVP — proximité, pas d'optimisation :

1. Le passager crée une demande de course → statut `en_recherche`.
2. Le serveur cherche les chauffeurs de **ce même opérateur**, `disponible = true`, dans un rayon (ex. 5 km), triés par distance au point de départ.
3. Notification envoyée au chauffeur le plus proche (canal temps réel, voir §5) ; délai de réponse ~15-20s.
4. Refus ou timeout → passe au chauffeur suivant de la liste.
5. Acceptation → statut `assignee`, passager et chauffeur reçoivent la mise à jour en temps réel.
6. Aucun chauffeur disponible après épuisement de la liste → statut `sans_chauffeur`, le passager est informé et peut relancer.

Le dispatch reste strictement intra-opérateur : deux opérateurs voisins dans la même ville ne se partagent jamais un chauffeur ou une course — c'est une conséquence directe du modèle white-label (§6 de l'Étape 1) et une garantie à mettre en avant auprès du partenaire (ses chauffeurs restent ses chauffeurs).

## 5. GPS / cartographie

- **Fond de carte et géocodage** : Mapbox GL JS (alternative : Google Maps JS API — à trancher selon coût/quota, sans impact sur le reste de l'architecture).
- **Position du passager/chauffeur** : géolocalisation navigateur (`navigator.geolocation`), pas de matériel dédié.
- **Estimation prix/distance/durée** : API de directions du fournisseur de carte, combinée à la grille tarifaire par zone définie côté Opérateur (§3).
- **Navigation turn-by-turn du chauffeur** : pas de moteur de routage propriétaire au MVP — un bouton ouvre l'itinéraire dans Google Maps/Waze déjà installé sur le téléphone du chauffeur. Économise un développement qui n'augmente pas la valeur perçue par l'opérateur (le chauffeur sait déjà utiliser Waze).
- **Mise à jour de la position en course** : diffusion en temps réel (broadcast) toutes les 3-5 secondes pendant une course active, sans écriture systématique en base ; une position est persistée périodiquement (ex. toutes les 30s) uniquement à des fins d'historique/support, pas pour le tracking live lui-même.

## 6. Modèle multi-opérateur (données)

Un seul schéma Postgres, isolation logique par `operateur_id` + RLS — même philosophie que SenMarket (`vendor_id = auth.uid()`), transposée au contexte mobilité. **Pas un projet Supabase par opérateur** : onboarder un nouvel opérateur doit rester une opération de configuration, pas un nouveau déploiement d'infrastructure (c'est l'argument de scalabilité du modèle white-label).

| Table | Contenu | Isolation |
|---|---|---|
| `operateurs` | tenant : nom, logo, couleurs, ville(s) couvertes, statut (pilote/actif/suspendu) | racine du multi-tenant |
| `zones_operateur` | zone de service + tarif de base + tarif/km, par opérateur | `operateur_id` |
| `chauffeurs` | identité, véhicule, statut de disponibilité, note moyenne | `operateur_id` |
| `passagers` | identité, téléphone | compte global (un passager peut potentiellement commander chez plusieurs opérateurs — pas de `operateur_id` sur le passager lui-même) |
| `courses` | passager, chauffeur, statut, positions départ/arrivée, prix estimé/final, horodatages | `operateur_id` |
| `avis_courses` | note + commentaire passager → chauffeur | via `course.operateur_id` |

Une brique livraison colis (question ouverte §7.3 de l'Étape 1) réutiliserait la même table `operateurs` et le même modèle de dispatch en ajoutant un type de `courses` (course "personne" vs "colis") plutôt qu'un nouveau système — c'est une extension possible, pas quelque chose à construire maintenant.

RLS : un chauffeur ne voit que les courses de son `operateur_id` où il est assigné ; un opérateur (son compte admin) ne voit que les lignes de son propre `operateur_id` ; l'admin FlowDynamicsAgency (rôle interne, service role / `is_admin()` type SenMarket) voit tout, pour le provisioning et le support.

## 7. Architecture technique

| Brique | Choix | Justification |
|---|---|---|
| Backend | Supabase (Postgres + Auth + Realtime + Storage) | Même stack que SenMarket, l'agence maîtrise déjà l'outil, permet d'aller vite jusqu'à samedi |
| Auth | Téléphone + OTP (Supabase Auth) | Adapté au marché marocain, pas de friction email |
| App Passager & Chauffeur | PWA Next.js, mobile-first, installable | Pas de délai de publication en store, cross-plateforme, réutilise le savoir-faire du repo actuel |
| Dashboard Opérateur + back-office Admin | Next.js (App Router), même pattern client/server/middleware que SenMarket | Cohérence avec l'existant, rapidité de mise en œuvre |
| Cartographie | Mapbox GL JS | Coût maîtrisé, bon support PWA |
| Temps réel (position, dispatch) | Supabase Realtime (broadcast + postgres changes) | Évite un serveur WebSocket dédié |
| Hébergement fronts | Vercel | Déjà utilisé dans ce repo (SenMarket, portfolio) |
| Notifications | In-app / Realtime uniquement au MVP, push natif (FCM/APNs) hors-scope | Suffisant pour une démo et un pilote à un seul opérateur |
| Emplacement du code | `mobility-os-maroc/` dans ce repo pour aller vite jusqu'à samedi ; migration vers un repo dédié à envisager en Étape 4/5 si le pilote est confirmé | Éviter de perdre du temps sur l'infra avant d'avoir validé le concept avec le partenaire |

## 8. Prochaine étape

Étape 3 : maquettes des écrans listés aux §1 et §2, identité visuelle du projet (nom définitif, logo Mobility OS Maroc, palette — distincte de la marque que chaque opérateur pourra personnaliser par-dessus), et un script de démonstration du parcours complet (passager commande → chauffeur accepte → course → notation, vu depuis les deux apps + le dashboard opérateur en simultané).
