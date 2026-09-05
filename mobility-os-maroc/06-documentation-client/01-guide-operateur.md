# Guide opérateur — prise en main du dashboard

Ce guide s'adresse à l'opérateur de transport (vous, ou la personne
désignée chez vous) qui gère la flotte, les tarifs et le suivi des
courses. Il couvre la version réelle de la plateforme (backend Supabase),
pas les maquettes de démonstration de l'étape 3.

## 1. Créer votre compte opérateur

Deux façons d'obtenir votre espace, selon ce qui a été convenu avec votre
équipe technique :

**A. Invitation (recommandé pour un vrai lancement)** — votre équipe
technique crée votre opérateur à l'avance (nom, ville, couleurs, zone
tarifaire de départ, chauffeurs pilotes) et vous envoie un lien
d'invitation à usage unique. Ouvrez ce lien, créez votre compte (email +
mot de passe) sur la page d'inscription qui s'affiche, et votre espace est
immédiatement rattaché à votre compte — personne d'autre ne peut le
réclamer après vous.

**B. Auto-inscription** — rendez-vous sur `/onboarding`, créez un compte
(email + mot de passe), puis remplissez le formulaire : nom de votre
entreprise, ville, couleurs de marque (une couleur principale et une
couleur secondaire — pré-remplies avec les couleurs par défaut de la
plateforme, à changer si vous avez votre propre identité visuelle), et une
première zone tarifaire (tarif de base + tarif au kilomètre). Votre espace
est créé et vous appartient dès la validation du formulaire.

Après la création, votre dashboard est accessible à une adresse propre à
votre entreprise : `/o/<votre-identifiant>/dashboard` (l'identifiant est
dérivé automatiquement du nom que vous avez saisi, modifiable au moment de
la création).

## 2. Ajouter vos premiers chauffeurs

Depuis le dashboard : ajoutez chaque chauffeur avec son nom et son numéro
de téléphone (celui qu'il utilisera pour se connecter à l'app Chauffeur —
aucun mot de passe, juste une vérification par code envoyé par SMS).
Renseignez le véhicule et la plaque si vous les avez déjà ; ce n'est pas
obligatoire pour démarrer.

**Recommandation pour un premier lancement** : commencez avec 5 à 10
chauffeurs, pas toute votre flotte cible — cela permet de roder le
dispatch et les habitudes avant d'ouvrir plus largement (cf.
`04-dossier-commercial/02-proposition-deploiement-pilote.md`, Phase 2).

## 3. Configurer vos zones tarifaires

Une zone = un tarif de base + un tarif au kilomètre. Vous pouvez en créer
plusieurs (par exemple une zone centre-ville et une zone périphérie avec un
tarif de base plus élevé). Le prix d'une course est **toujours calculé par
le serveur** à partir de la distance réelle entre le départ et l'arrivée
— jamais par l'app du passager — donc aucun risque qu'un prix affiché soit
falsifié avant validation.

## 4. Suivre l'activité au quotidien

Le dashboard affiche vos chauffeurs (disponible/en course/hors ligne, avec
un indicateur si leur position GPS est fraîche ou non), vos courses en
cours et récentes, et signale automatiquement une course « bloquée » — un
chauffeur assigné depuis plus de 20 minutes sans progression, signe qu'il
faut probablement l'appeler. Un bouton dédié permet de **clôturer
manuellement** une course qui reste coincée (le chauffeur redevient
disponible immédiatement).

## 5. Ce qui vous appartient, ce qui ne vous appartient pas

Vous voyez et modifiez uniquement vos propres chauffeurs, zones et
courses — jamais ceux d'un autre opérateur de la plateforme, même si
plusieurs opérateurs partagent la même installation technique
(architecture multi-tenant, testée systématiquement à chaque mise à jour).
Certains compteurs (note moyenne, nombre de courses, nombre de produits)
sont calculés automatiquement par le système à partir de l'activité réelle
— vous ne pouvez pas les modifier directement, ce qui garantit qu'ils
restent fiables pour vos passagers.

## Support

En cas de blocage (chauffeur qui n'apparaît pas, course qui ne se
débloque pas, question sur la configuration), contactez votre équipe
technique avec l'heure exacte et l'identifiant de la course ou du
chauffeur concerné — cela accélère beaucoup le diagnostic.
