# Proposition de déploiement du pilote (Étape 4)

Objectif : passer des maquettes cliquables (Étape 3) à un pilote réel avec le partenaire, sans sur-promettre de délai. Les durées ci-dessous sont des ordres de grandeur **[À VALIDER]** une fois la ville, la taille de flotte de départ et la disponibilité des deux équipes connues.

## Phase 0 — Cadrage (semaine du lancement du pilote)

- Signature de l'expression d'intérêt (voir `03-expression-interet-eoi.md`).
- Choix de la ville et de la zone de départ (une seule zone, cf. Étape 2).
- Grille tarifaire de départ définie avec l'opérateur (tarif de base + tarif/km).
- Liste des 5 à 10 premiers chauffeurs pilotes fournie par l'opérateur — démarrer petit plutôt qu'avec les 15 chauffeurs de l'hypothèse de chiffrage, pour limiter le risque le temps que le dispatch et le paiement cash soient rodés.
- Éléments de marque de l'opérateur (nom, logo, couleurs) transmis pour configuration.

## Phase 1 — Construction technique (2 à 4 semaines selon disponibilité)

- Mise en place de l'infrastructure réelle (Supabase : tables multi-tenant, RLS, Realtime) décrite dans l'Étape 2, en remplacement du prototype statique de l'Étape 3.
- Connexion des apps Passager et Chauffeur à ce backend réel (les écrans de l'Étape 3 servent de base, pas à refaire de zéro).
- Dashboard Opérateur connecté aux données réelles (courses, chauffeurs, chiffre d'affaires).
- Tests internes avec des comptes de test avant d'impliquer de vrais chauffeurs/passagers.

## Phase 2 — Lancement fermé (1 à 2 semaines)

- Activation des 5 à 10 chauffeurs pilotes, formation courte (30 min suffisent avec une app aussi simple que la maquette de l'Étape 3).
- Passagers de test : équipe de l'opérateur, proches, clients identifiés — pas encore de communication publique.
- Objectif : valider que le parcours complet (commande → dispatch → course → paiement cash → notation) fonctionne en conditions réelles, corriger les frictions.

## Phase 3 — Lancement public sur la zone pilote (2 à 4 semaines)

- Ouverture au public dans la zone choisie, montée en charge progressive de la flotte vers la taille cible (ex. 15-30 chauffeurs selon le chiffrage de `01-modele-economique-chiffre.md`).
- Suivi rapproché des métriques clés : nombre de courses/jour, taux de courses sans chauffeur disponible, taux d'annulation, note moyenne.

## Phase 4 — Bilan du pilote (à l'issue de la période convenue, ex. 3 mois)

- Revue des métriques face aux objectifs fixés en Phase 0.
- Décision conjointe : passage à l'échelle (deuxième zone, deuxième opérateur) ou ajustements du modèle avant d'aller plus loin.
- C'est à ce stade que la proposition de partenariat plus large (au-delà du seul pilote) se négocie, avec des données réelles plutôt que les hypothèses de ce dossier.

## Ce qui n'est volontairement pas dans cette proposition

- Un engagement de délai ferme chiffré en jours précis — tant que la taille de l'équipe de développement disponible pour la Phase 1 n'est pas connue, tout chiffre serait une promesse non tenable.
- Une deuxième ville ou un deuxième opérateur — hors sujet tant que le premier pilote n'a pas produit de résultats.
