# Étape 1 — Concept verrouillé

Ce document est une proposition de verrouillage à valider avec toi avant de passer à l'Étape 2 (architecture fonctionnelle). Les points marqués **[À VALIDER]** sont des hypothèses de travail, pas des faits établis — il n'existe aujourd'hui aucun partenaire, code ou donnée métier réels pour Mobility OS Maroc dans ce repo ; tout part de zéro.

## 1. Concept

**Nom (provisoire) :** Mobility OS Maroc
**[À VALIDER]** — un nom produit distinct du nom de l'opérateur final sera nécessaire pour le marketing marque blanche (voir §5). "Mobility OS" peut rester le nom interne/technique de la plateforme.

**Pitch en une phrase :**
Une plateforme de mobilité (VTC, transport à la demande, éventuellement livraison) que FlowDynamicsAgency fournit clé en main à des opérateurs de transport marocains, pour qu'ils lancent leur propre application sous leur propre marque — sans avoir à construire ni à maintenir la technologie.

**Problème adressé :**
- Les opérateurs de transport locaux (coopératives de taxis, sociétés de VTC régionales, flottes privées) au Maroc n'ont ni le budget ni l'équipe pour développer une app de mobilité comparable aux standards du marché.
- Les plateformes internationales existantes ne sont pas configurables par un opérateur local, ne partagent pas de revenu de licence avec lui, et le mettent en concurrence directe plutôt que de lui donner un outil.

**Solution :**
Une plateforme multi-tenant (un seul moteur technique, plusieurs marques déployées dessus) : chaque opérateur obtient une app Passager, une app Chauffeur et un dashboard de gestion à son nom, sur une infrastructure commune maintenue par FlowDynamicsAgency.

## 2. Modèle économique

**[À VALIDER — c'est l'hypothèse structurante de tout le reste du document]**

Revenus de FlowDynamicsAgency, structure hybride recommandée :

| Composante | Quand | Objectif |
|---|---|---|
| **Frais de mise en service (setup fee)** | À l'onboarding de chaque nouvel opérateur | Couvre la configuration du tenant (marque, zones, tarifs, formation) |
| **Abonnement SaaS mensuel** | Récurrent, par opérateur (ou par flotte/ville gérée) | Revenu prévisible, couvre l'hébergement/maintenance/support |
| **Commission par course (optionnelle)** | % du montant de chaque course, prélevé au règlement | Aligne le revenu de FlowDynamicsAgency sur la croissance réelle de l'opérateur |

Pourquoi hybride plutôt qu'un seul levier :
- Un abonnement pur est simple à vendre à un opérateur qui débute (coût prévisible), mais ne capte rien de la croissance.
- Une commission pure fait dépendre tout le revenu du volume de courses, ce qui est risqué tant que le pilote n'a pas prouvé le volume.
- Le mix (petit abonnement + petite commission) réduit le risque des deux côtés et donne un argument de vente clair : *« vous payez peu au départ, on gagne quand vous gagnez »*.

Qui paie qui :
- **Opérateur → FlowDynamicsAgency (ou vers le partenaire, selon le montage — voir §6)** : setup fee + abonnement + commission.
- **Passager → Opérateur** : prix de la course (cash au démarrage, voir MVP).
- **Chauffeur ↔ Opérateur** : reversement de la course selon les règles internes de l'opérateur (hors périmètre de la plateforme au MVP — la plateforme enregistre, ne fait pas de paiement chauffeur automatisé).

## 3. Utilisateurs

Quatre profils, chacun avec un besoin et une interface dédiée.

| Rôle | Besoin principal | Fonctionnalités clés | Interface |
|---|---|---|---|
| **Passager** | Obtenir une course fiable, rapidement, à un prix connu à l'avance | Créer un compte, localiser un point de départ/arrivée, commander une course, voir le prix estimé, suivre le chauffeur, payer (cash au MVP), noter la course | App mobile (marque de l'opérateur) |
| **Chauffeur** | Recevoir des courses régulièrement, savoir combien il gagne | Se connecter/passer disponible, recevoir et accepter une demande, naviguer vers le passager, marquer la course terminée, consulter son historique de gains | App mobile (marque de l'opérateur) |
| **Opérateur (le client payant)** | Piloter sa flotte et voir que la plateforme lui rapporte de l'argent | Gérer ses chauffeurs (ajout/retrait, statut), définir zones et tarifs, voir courses en cours et historique, voir un chiffre d'affaires agrégé, personnaliser sa marque (logo, couleurs, nom d'app) | Dashboard web |
| **Admin FlowDynamicsAgency** | Superviser tous les opérateurs, provisionner de nouveaux tenants, facturer | Créer/configurer un nouvel opérateur (tenant), vue globale multi-opérateurs, suivi de la facturation SaaS/commission, support | Back-office interne (pas montré au partenaire, mais doit exister dès le MVP techniquement) |

**[À VALIDER]** : y a-t-il un cinquième profil, un **partenaire régional multi-opérateurs** (quelqu'un qui revend/supervise plusieurs opérateurs sous lui) ? Voir §6 — cela dépend de qui est "le partenaire" samedi. Si oui, ce profil a besoin d'une vue consolidée entre l'Admin FlowDynamicsAgency et le dashboard d'un seul Opérateur.

## 4. MVP

**Objectif du MVP :** permettre au partenaire de dire *« on peut présenter ça à mes opérateurs »* — c'est-à-dire un parcours complet, démontrable de bout en bout, pas une suite d'écrans statiques.

Test appliqué à chaque fonctionnalité candidate : **est-ce que ça augmente la valeur du produit que l'opérateur peut acheter ?** Si la réponse est non, elle sort du MVP.

### Dans le MVP

- **Parcours Passager complet** : inscription, saisie départ/arrivée, estimation de prix, commande, suivi de statut de la course (même si le tracking GPS temps réel est simplifié — voir hors-scope), paiement cash à l'arrivée, notation.
- **Parcours Chauffeur complet** : connexion, passage disponible/indisponible, réception d'une demande, acceptation, navigation vers le passager (peut s'appuyer sur une app de cartographie externe au MVP plutôt qu'un moteur de navigation propriétaire), fin de course, historique de gains.
- **Dispatch simple** : attribution d'une course au chauffeur disponible le plus proche. Pas besoin d'algorithme d'optimisation avancé — la proximité suffit pour démontrer la valeur.
- **Dashboard Opérateur minimal** : liste des chauffeurs et leur statut, courses en cours, historique des courses, chiffre d'affaires agrégé simple, gestion basique des tarifs par zone.
- **Marque blanche visuelle** : logo, nom d'app et couleurs personnalisables par opérateur — c'est l'argument de vente central du modèle, donc non négociable même au MVP.
- **Multi-tenant technique** : même si un seul opérateur pilote est démontré samedi, l'architecture doit déjà séparer proprement les données par opérateur (voir Étape 2) pour que l'histoire "on peut onboarder un deuxième opérateur en X jours" soit crédible et pas juste promise.

### Hors MVP (explicitement)

- Paiement in-app par carte / mobile money intégré (le cash suffit pour prouver le concept).
- Optimisation de dispatch avancée (prédiction de demande, tarification dynamique).
- Moteur de cartographie/navigation propriétaire (s'appuyer sur une solution existante, ex. Google Maps/Mapbox, au moins pour la démo).
- Système de notation/réputation avancé, programme de fidélité, support multi-langue complet.
- Facturation automatisée pour les opérateurs (le suivi financier peut être manuel/semi-manuel côté FlowDynamicsAgency au pilote).
- Application dédiée pour un éventuel profil "partenaire multi-opérateurs" (voir §3) — si ce profil existe, une vue simplifiée / des slides suffisent samedi, pas un vrai dashboard.

## 5. Modèle white-label

- **Une plateforme technique unique, multi-tenant** : un seul backend, un seul moteur de dispatch, un seul jeu d'apps "template" (Passager, Chauffeur, Dashboard).
- **Par opérateur (tenant), ce qui est personnalisable** : nom de l'app, logo, palette de couleurs, zones géographiques couvertes, grille tarifaire, liste des chauffeurs.
- **Ce qui reste commun à tous les opérateurs (non personnalisable)** : le moteur de dispatch, la logique de calcul de prix (les paramètres changent, la formule non), le modèle de données, l'infrastructure d'hébergement.
- **Provisioning d'un nouvel opérateur** : l'objectif commercial est qu'onboarder un nouvel opérateur soit une opération de configuration (créer le tenant, charger sa marque, définir ses zones/tarifs, ajouter ses chauffeurs) et non un nouveau développement. C'est ce qui rend le modèle scalable et c'est l'argument à mettre en avant samedi : *"chaque nouvel opérateur ne redémarre pas le projet, il branche sa flotte sur une plateforme qui existe déjà."*

## 6. Rôles — FlowDynamicsAgency et le partenaire

**Validé : Option A.** Le partenaire de la présentation de samedi est lui-même un opérateur de transport (premier client pilote), pas un intermédiaire commercial. Conséquence directe : il n'y a pas de 5ᵉ profil "partenaire multi-opérateurs" à concevoir dans le produit (question ouverte §7 n°2 résolue) — le partenaire est une instance du profil "Opérateur" du §3, la première.

Deux montages avaient été envisagés :

**Option A — le partenaire est lui-même un opérateur de transport (client final)**
- FlowDynamicsAgency : conçoit, développe, héberge et maintient la plateforme ; fournit le support technique ; définit la roadmap produit.
- Partenaire : premier opérateur pilote — fournit ses chauffeurs, sa connaissance du terrain (zones, tarifs pratiqués, réglementation VTC/taxi locale), teste le produit en conditions réelles, et sert de référence commerciale pour recruter d'autres opérateurs ensuite.

**Option B — le partenaire est un intermédiaire commercial/réseau (pas un opérateur lui-même)**
- FlowDynamicsAgency : même rôle technique qu'en Option A (produit, dev, maintenance).
- Partenaire : apporte le réseau et la relation commerciale avec plusieurs opérateurs de transport marocains, gère le go-to-market local, éventuellement la conformité réglementaire locale, et peut toucher une part du revenu SaaS/commission en tant qu'apporteur d'affaires ou distributeur régional.

Le choix entre A et B change directement la table de revenu du §2 (qui facture qui) et la question du "cinquième profil" du §3. **Cette décision doit être prise avant l'Étape 4** (dossier commercial), mais n'empêche pas de démarrer l'Étape 2 (architecture) puisque l'architecture technique est la même dans les deux cas.

## 7. Questions ouvertes

1. ~~Le partenaire de samedi est-il l'Option A ou l'Option B du §6 ?~~ **Tranché : Option A.**
2. ~~Un profil "partenaire multi-opérateurs" doit-il exister dans le produit ?~~ **Tranché : non, le partenaire est le premier Opérateur.**
3. Le périmètre du service est-il VTC uniquement, ou doit-on inclure dès le concept une brique livraison (colis/marchandises), sachant que SenMarket (ce repo) a déjà une problématique de logistique Sénégal-Maroc qui pourrait, à terme, être un cas d'usage de la même plateforme de mobilité ? **Non tranché — traité en Étape 2 comme hors-MVP, VTC uniquement, sans fermer la porte techniquement (voir `02-architecture-fonctionnelle.md`).**
4. Zone géographique du pilote : une seule ville pour la démo de samedi, ou plusieurs zones dès le départ ? **Non tranché — traité en Étape 2 : hypothèse de travail = une seule ville pour la démo.**

## 8. Prochaine étape

Une fois ce document validé (ou corrigé), l'Étape 2 formalise : le parcours Passager écran par écran, le parcours Chauffeur écran par écran, le contenu du dashboard Opérateur, la logique de dispatch, le choix technique GPS/cartographie, le modèle de données multi-opérateur, et l'architecture technique globale (stack, hébergement, séparation des tenants).
