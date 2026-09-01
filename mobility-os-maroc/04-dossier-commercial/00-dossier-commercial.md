# Dossier commercial — Mobility OS Maroc

Document de synthèse pour la présentation au partenaire (Étape 5). Il relie tout ce qui a été construit aux Étapes 1 à 4 dans l'ordre où le partenaire doit le découvrir : **concept → démonstration → modèle commercial → stratégie → pilote → proposition de partenariat**. Le support visuel (diapositives) suit exactement ce même plan — voir `presentation-partenaire-v2.pptx` dans ce dossier (v2 : reconstruit pour refléter le produit réel déployé, `presentation-partenaire.pptx` d'origine gardé pour mémoire uniquement).

## 1. Concept

Mobility OS Maroc est une plateforme de mobilité multi-services fournie en marque blanche : FlowDynamicsAgency construit et maintient la technologie (apps Passager, Chauffeur, dashboard de gestion), l'opérateur de transport la déploie sous sa propre marque, auprès de ses propres chauffeurs et clients.
→ détail complet : `../01-concept-verrouille.md`

## 2. Démonstration

Un prototype cliquable existe déjà et fonctionne (testé de bout en bout) : parcours Passager complet, parcours Chauffeur complet, dashboard Opérateur, et surtout la preuve du modèle white-label — changer la marque dans le dashboard rethématise instantanément les deux apps.
→ maquettes : `../prototype/index.html` — script de démonstration : `../03-maquettes-identite-demo.md`

## 3. Modèle commercial

Trois leviers de revenu pour FlowDynamicsAgency : un frais de mise en service à l'onboarding, un abonnement mensuel prévisible, une commission sur les courses qui aligne le revenu de l'agence sur la réussite de l'opérateur. Chiffré sur une hypothèse de pilote à 3 mois.
→ détail et chiffrage : `01-modele-economique-chiffre.md`

## 4. Stratégie

Un seul moteur technique multi-tenant, plusieurs marques déployées dessus. Onboarder un nouvel opérateur doit rester une opération de configuration, pas un nouveau développement — c'est ce qui rend le modèle scalable au-delà du premier pilote.
→ détail : `../02-architecture-fonctionnelle.md` (§6 et §7)

## 5. Pilote

Un déploiement en 5 phases, du cadrage à la montée en charge, avec un point de bilan explicite avant toute discussion de passage à l'échelle.
→ détail : `02-proposition-deploiement-pilote.md`

## 6. Proposition de partenariat

Une expression d'intérêt non contraignante, qui cadre les engagements réciproques le temps de préparer le pilote, sans figer prématurément des conditions financières qui seront confirmées dans un contrat de pilote formel.
→ document à faire signer : `03-expression-interet-eoi.md`

## Rappel de la règle directrice du chantier

> On ne développe pas une application pour impressionner. On construit un prototype destiné à être vendu à de vrais opérateurs de transport.

Chaque élément de ce dossier répond à la même question que chaque écran des maquettes : est-ce que ça augmente la valeur du produit que l'opérateur peut acheter ? Les chiffres du modèle économique sont volontairement présentés comme des hypothèses ajustables en direct plutôt que comme une offre figée, pour que la présentation de samedi reste une négociation, pas une annonce à prendre ou à laisser.

## Statut des hypothèses non tranchées (reportées d'étapes précédentes)

Ces points n'empêchent pas la présentation de samedi, mais méritent d'être évoqués avec le partenaire s'ils reviennent dans la discussion :
- Zone géographique du pilote : une seule ville par défaut (Étape 2).
- Périmètre VTC uniquement, pas de brique livraison au MVP, même si l'architecture ne l'exclut pas plus tard (Étape 1 §7, Étape 2 §6).
- Taux de commission et paliers d'abonnement au-delà de 30 chauffeurs : à ajuster selon la réaction du partenaire (`01-modele-economique-chiffre.md`).
