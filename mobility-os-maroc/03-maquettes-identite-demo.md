# Étape 3 — Maquettes, identité visuelle, démonstration du parcours complet

**Maquettes cliquables : `mobility-os-maroc/prototype/index.html`** (ouvrir dans un navigateur, aucun serveur ni installation requis — HTML/CSS/JS statique, dans l'esprit du prototype déjà utilisé pour SenMarket dans ce repo).

Testé de bout en bout avec Playwright/Chromium avant livraison (parcours Passager complet, parcours Chauffeur complet, changement de marque depuis le dashboard répercuté en direct sur les apps) : aucune erreur JS, tous les enchaînements d'écrans fonctionnent.

## 1. Identité visuelle

Deux identités coexistent volontairement dans les maquettes, pour rendre le modèle white-label visible plutôt que juste expliqué :

**Identité "plateforme" (Mobility OS)** — utilisée par défaut, et dans le back-office/les supports de pitch :
- Indigo nuit `#101B3D` (sérieux, technologie) + Ambre `#FF7A28` (énergie, mouvement).
- Volontairement différente de la palette SenMarket (vert/or) : ce n'est pas le même produit, pas la même marque.
- Le "M" est un monogramme simple (carré arrondi + initiale) — un vrai logo sera à concevoir en Étape 4/5 si le pilote se confirme, ce monogramme suffit pour la démo.

**Identité "opérateur pilote" (TransAtlas — nom de démonstration)** :
- Sarcelle `#0E6B5C` + Or `#F2B705`, évoque le Maroc sans être un drapeau ou un cliché.
- "TransAtlas" est un **nom fictif choisi pour la démo**, pas le nom réel du partenaire — à remplacer par sa vraie marque si on veut personnaliser la démo de samedi avec son nom et ses couleurs (rapide à faire : deux variables CSS à changer, voir `prototype/css/styles.css`, bloc `[data-brand="transatlas"]`).

**Le point de démonstration clé** : dans le dashboard Opérateur, l'onglet **Marque** permet de basculer entre les deux identités. Ce choix est mémorisé (stockage local du navigateur) et relit instantanément par les apps Passager et Chauffeur — sans rien recharger côté code. C'est la preuve visuelle du §5 de l'Étape 2 (white-label = configuration, pas redéveloppement).

## 2. Où sont les écrans

| Fichier | Contenu |
|---|---|
| `prototype/index.html` | Hub d'entrée, liens vers les 3 expériences |
| `prototype/passager.html` | 7 écrans du parcours Passager (Étape 2 §1) |
| `prototype/chauffeur.html` | 7 écrans du parcours Chauffeur (Étape 2 §2) |
| `prototype/dashboard.html` | Dashboard Opérateur : vue d'ensemble, chauffeurs, zones/tarifs, courses, marque (Étape 2 §3) |
| `prototype/css/styles.css` | Palette, thème white-label, composants partagés |
| `prototype/js/brand.js` | Bascule de marque entre pages (démonstration white-label) |
| `prototype/js/screens.js` | Navigation entre écrans à l'intérieur d'une app |

Toutes les données affichées (chauffeurs, courses, montants) sont fictives, écrites en dur pour la démo — il n'y a aucun backend derrière ces pages à ce stade (cohérent avec l'Étape 2 : l'architecture Supabase/Realtime n'est pas encore construite, ces maquettes servent à valider les écrans et le discours avant d'investir dans le vrai backend).

## 3. Script de démonstration du parcours complet

Objectif : montrer au partenaire, en direct, le même scénario vécu depuis 3 points de vue (passager, chauffeur, opérateur), pour qu'il visualise concrètement ce que ses équipes utiliseraient.

**Préparation (avant l'arrivée du partenaire) :**
1. Ouvrir trois onglets côte à côte (ou trois fenêtres) : `passager.html`, `chauffeur.html`, `dashboard.html`.
2. Dans le dashboard → onglet **Marque**, sélectionner l'identité de l'opérateur (par défaut "Mobility OS", ou la marque du partenaire si personnalisée avant la présentation).
3. Rafraîchir les onglets Passager et Chauffeur pour qu'ils reprennent la marque choisie.

**Déroulé (≈4 minutes) :**

1. **Coup d'œil dashboard** (onglet Opérateur, "Vue d'ensemble") : *"Voici ce que voit un opérateur qui utilise déjà la plateforme — ses courses du jour, son chiffre d'affaires, sa flotte."*
2. **Côté Passager** : connexion (skip OTP) → accueil → saisir une destination → écran de confirmation avec prix → *"Commander"*. *"Le prix est annoncé avant la course, comme sur les standards du marché."*
3. Écran "Recherche d'un chauffeur…" (3 secondes, automatique) → passage à l'écran de course. *"Ici, en coulisses, la plateforme vient de proposer la course au chauffeur disponible le plus proche — chez cet opérateur uniquement, jamais chez un opérateur voisin."*
4. **Bascule côté Chauffeur** : cliquer *"Simuler une demande de course"* → montrer l'écran de notification avec le compte à rebours → *"Accepter"* → *"Ouvrir la navigation"* (montre l'intégration avec Waze/Google Maps, pas de réinvention de la roue) → *"Je suis arrivé"* → *"Terminer la course"*.
5. **Retour côté Passager** : écran de fin de course, notation du chauffeur en étoiles.
6. **Retour au Dashboard** : montrer l'onglet "Courses" avec l'historique. *"Tout ce qui vient de se passer sur les deux téléphones est visible ici, pour l'opérateur, en temps réel."*
7. **Clou de la démo — Marque** : dans l'onglet "Marque" du dashboard, basculer l'identité en direct (ex. de "Mobility OS" vers "TransAtlas"), puis rouvrir/rafraîchir l'onglet Passager. *"Même produit, même infrastructure, marque différente — c'est exactement ce qu'un nouvel opérateur obtient en quelques clics, pas en redéveloppant une app."*

**Message de clôture à porter** : *"Ce que vous venez de voir tourne déjà, aujourd'hui, sans backend réel derrière — l'étape suivante est de brancher ces écrans sur la vraie plateforme (dispatch, comptes, paiement) décrite dans notre architecture technique, avec vous comme premier opérateur pilote."*

## 4. Limites connues de ces maquettes (à ne pas cacher si la question vient)

- Pas de vraie carte (fond simulé), pas de vrai GPS, pas de vrai dispatch — tout est scripté pour la démo.
- Pas de compte réel ni de persistance de données au-delà du choix de marque (stocké localement dans le navigateur).
- Le nom "TransAtlas" est un nom de démonstration, à remplacer par la marque réelle du partenaire si on veut personnaliser la présentation avec son identité.

## 5. Prochaine étape

Étape 4 : dossier commercial — présentation partenaire, expression d'intérêt (EOI), modèle économique détaillé (chiffrage du setup fee/abonnement/commission du §2 de l'Étape 1), proposition de déploiement pour le pilote.
