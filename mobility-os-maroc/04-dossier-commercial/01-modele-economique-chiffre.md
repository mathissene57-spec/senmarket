# Modèle économique chiffré (Étape 4)

**Avertissement — à lire avant d'utiliser ce document face au partenaire :** tous les montants ci-dessous sont des **hypothèses de travail illustratives**, construites pour donner une forme concrète au modèle qualitatif de l'Étape 1 (§2). Ce ne sont ni des prix du marché vérifiés, ni une offre déjà négociée. Avant de les présenter comme une proposition ferme, il faut les confronter à : les tarifs VTC/taxi réellement pratiqués dans la ville visée, la structure de coûts réelle de FlowDynamicsAgency (hébergement, support, temps de développement), et ce que le partenaire est prêt à entendre. Ils sont volontairement ronds et faciles à ajuster en direct pendant la négociation.

## 1. Structure tarifaire proposée

| Composante | Montant indicatif | Fréquence |
|---|---|---|
| Frais de mise en service (setup fee) | **15 000 DH** | une fois, au démarrage du pilote |
| Abonnement plateforme | **2 500 DH / mois** | mensuel, jusqu'à 30 chauffeurs actifs sur une ville |
| Commission sur les courses | **5 % du montant de chaque course** | facturée mensuellement, sur la base des courses enregistrées par le dashboard (le règlement passager reste cash au MVP — voir Étape 2 §7) |

**Geste commercial possible pour sécuriser le tout premier pilote** : offrir ou réduire de moitié le setup fee du partenaire de samedi, en échange de son statut de référence ("premier opérateur, cas d'usage de lancement") citable auprès des opérateurs suivants. À trancher selon la dynamique de la négociation, pas à annoncer d'emblée.

## 2. Hypothèses de volume utilisées pour chiffrer

**[À VALIDER avec le partenaire — ce sont des ordres de grandeur, pas des données de marché confirmées]**

| | Mois 1 (lancement) | Mois 3 (montée en charge) |
|---|---|---|
| Chauffeurs actifs | 15 | 30 |
| Courses / chauffeur / jour | 8 | 10 |
| Courses / jour (flotte) | 120 | 300 |
| Prix moyen d'une course | 30 DH | 30 DH |
| **GMV mensuel** (valeur totale des courses) | ≈ 108 000 DH | ≈ 270 000 DH |

GMV = Gross Merchandise Value, c'est-à-dire l'argent qui transite par la plateforme (payé par les passagers aux chauffeurs), pas le revenu de FlowDynamicsAgency.

## 3. Revenu FlowDynamicsAgency estimé sur le pilote (3 mois)

| | Mois 1 | Mois 2 (hypothèse intermédiaire, 190 000 DH de GMV) | Mois 3 |
|---|---|---|---|
| Setup fee | 15 000 DH | — | — |
| Abonnement | 2 500 DH | 2 500 DH | 2 500 DH |
| Commission (5 % du GMV) | 5 400 DH | 9 500 DH | 13 500 DH |
| **Total mensuel** | **22 900 DH** | **12 000 DH** | **16 000 DH** |

**Cumul sur les 3 mois du pilote : environ 50 900 DH.** À comparer, pour la négociation, au coût qu'un opérateur paierait pour faire développer sa propre app (largement supérieur, et sans le partage de risque qu'apporte le modèle commission).

## 4. Ce que gagne l'opérateur (l'argument à mettre en avant)

- **Aucun investissement technique initial** au-delà du setup fee — pas d'équipe dev à recruter, pas de maintenance à assurer.
- **Coût aligné sur l'activité réelle** : l'abonnement fixe est faible, l'essentiel du coût (la commission) n'existe que si la plateforme génère effectivement du chiffre d'affaires pour l'opérateur.
- **Exemple concret pour le partenaire** : au mois 3, sur 270 000 DH de courses, l'opérateur reverse 16 000 DH à FlowDynamicsAgency (≈ 6 % de son chiffre d'affaires courses) et garde tout le reste, y compris ce qu'il reverse lui-même à ses chauffeurs selon ses propres règles.

## 5. Ce qui reste à trancher avant de figer une offre

1. Le taux de commission (5 % est un point de départ raisonnable pour un premier pilote, à comparer aux standards du secteur si connus).
2. Le palier d'abonnement au-delà de 30 chauffeurs ou pour une deuxième ville — non chiffré ici, à construire une fois le pilote validé.
3. Qui facture qui si le montage final n'est pas l'Option A pure (voir Étape 1 §6) — non pertinent tant que l'Option A reste validée.
