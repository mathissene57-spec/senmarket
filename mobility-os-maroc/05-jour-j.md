# Étape 5 — Jour J : présentation au partenaire

Ce document est le seul qu'il faut avoir sous les yeux samedi. Il ne remplace aucun des documents précédents — il les organise pour l'exécution en direct. La présentation elle-même est un moment réel, pas quelque chose que ce chantier peut "terminer" à ta place : ce qui suit prépare tout ce qui peut l'être à l'avance pour que l'exécution se passe bien.

## Objectif de la session

Rappel de la brief initiale : ne pas arriver avec une idée, mais avec quelque chose qui permette au partenaire de dire *« on peut présenter ça à mes opérateurs »*. Tout ce qui suit sert cet objectif — pas à impressionner, à convaincre qu'on peut démarrer un pilote concret rapidement.

## Checklist avant de partir

- [ ] Ordinateur chargé + chargeur dans le sac (la démo ne dépend d'aucune connexion internet — tout tourne en local, mais la batterie si).
- [ ] `mobility-os-maroc/prototype/index.html` ouvert et testé une dernière fois la veille (les 3 apps + le changement de marque dans le dashboard).
- [ ] `presentation-partenaire-v2.pptx` ouvert une fois pour vérifier qu'il s'affiche correctement sur la machine utilisée samedi (polices Cambria/Calibri, standard sur toute installation Office — le contenu reste lisible même avec une police de secours). **C'est ce fichier qu'on présente**, pas `presentation-partenaire.pptx` (v1, gardé pour mémoire — voir note ci-dessous).
- [ ] **Si le nom et les couleurs réels du partenaire sont connus avant samedi** : remplacer "TransAtlas" par sa vraie marque dans `prototype/css/styles.css` (bloc `[data-brand="transatlas"]`) et régénérer les captures d'écran du deck — sinon, présenter tel quel en expliquant que "TransAtlas" est un nom de démonstration à remplacer par la sienne en une configuration, pas un développement (ça illustre d'ailleurs directement l'argument white-label).
- [ ] Deux exemplaires imprimés de `04-dossier-commercial/03-expression-interet-eoi.md` (ou converti en PDF) si une signature papier est envisageable sur place.
- [ ] Le PPTX (`04-dossier-commercial/presentation-partenaire-v2.pptx`) reconstruit les écrans clés en diapositive (pas des captures d'écran) et intègre la preuve d'exécution (backend réel, tests, sécurité auditée) — il sert de **filet de sécurité automatique** si la démo live ou le wifi pose problème, pas besoin de préparer autre chose pour ce cas.
- [ ] **v1 vs v2** : `presentation-partenaire.pptx` (v1) a été construit avant que le produit réel n'existe — maquette cliquable uniquement. `presentation-partenaire-v2.pptx` reflète l'état réel du projet (backend Supabase déployé, dispatch testé, sécurité durcie) et adopte un système visuel réutilisable pour les prochaines présentations FlowDynamicsAgency (palette encre/cuivre, Cambria/Calibri, cartes iconées) — voir le message qui accompagne sa livraison pour le détail. v1 est gardé pour mémoire, pas à présenter.
- [ ] Relire une fois `00-dossier-commercial.md` pour avoir toute la trame en tête, et les questions ouvertes non tranchées (ville, périmètre VTC uniquement, taux de commission) pour ne pas être pris au dépourvu si elles reviennent.

## Déroulé minuté (~25-30 min, hors questions)

Les notes de présentateur (parlé, phrase par phrase) sont déjà intégrées dans chaque diapositive du PPTX (mode présentateur PowerPoint/Keynote/Google Slides) — ce tableau donne juste le minutage et le geste à faire.

| # | Temps | Diapo | Geste |
|---|---|---|---|
| 1 | 1 min | Titre | Intro, poser l'objectif de la session |
| 2 | 2 min | Le problème | Rester factuel — c'est un constat, pas une critique du partenaire |
| 3 | 2 min | Le concept | Poser le principe avant de le montrer |
| 4 | 5 min | Démonstration | **Basculer sur le navigateur** — dérouler le parcours complet en direct (script détaillé : `03-maquettes-identite-demo.md` §3) |
| 5 | 2 min | Preuve du white-label | Si possible, faire le changement de marque en direct dans le dashboard plutôt que rester sur la diapo |
| 6 | 2 min | Modèle commercial | Les 3 leviers, sans encore donner les chiffres |
| 7 | 3 min | Chiffrage indicatif | Insister sur "hypothèse de travail, à ajuster ensemble" |
| 8 | 2 min | Stratégie | Message clé : ce n'est pas qu'un projet pour lui, c'est un moteur réutilisable |
| 9 | 2 min | Plan de déploiement | Insister sur le démarrage petit (5-10 chauffeurs), pas 30 dès le jour 1 |
| 10 | 2 min | Proposition de partenariat | Symétrie des engagements — ce n'est pas à sens unique |
| 11 | 1 min | Prochaines étapes | Proposer explicitement de signer l'EOI sur place |
| — | 10-15 min | — | Questions (voir ci-dessous) |

## Questions probables et éléments de réponse

- **« Combien ça va vraiment me coûter ? »** → Renvoyer aux 3 leviers (setup fee, abonnement, commission), donner l'exemple chiffré du pilote (`01-modele-economique-chiffre.md`), et redire explicitement que les montants sont un point de départ ajustable, pas un tarif imposé.
- **« Pourquoi vous plutôt qu'une plateforme internationale existante ? »** → Contrôle de la marque, partage de revenu, pas de mise en concurrence de l'opérateur avec lui-même (slide "Le problème").
- **« Et si mes chauffeurs ne veulent pas changer d'outil ? »** → L'app chauffeur de la démo est volontairement simple (formation de 30 minutes suffit, cf. `02-proposition-deploiement-pilote.md` Phase 2) ; le lancement fermé sert justement à absorber cette friction avant l'ouverture au public.
- **« Qu'est-ce qui se passe si je veux arrêter le pilote en cours de route ? »** → L'EOI n'est pas contraignante (§6 de `03-expression-interet-eoi.md`) ; un contrat de pilote formel, distinct, viendra encadrer la suite si les deux parties souhaitent continuer.
- **« La plateforme tient la charge si ça grossit vite ? »** → Répondre avec honnêteté : ce qui existe aujourd'hui est un prototype cliquable (Étape 3), l'infrastructure réelle (Supabase, décrite en Étape 2) reste à construire en Phase 1 du déploiement — c'est justement l'objet du pilote que de le prouver à petite échelle avant d'aller plus loin.
- **« Vous livrez de la livraison de colis aussi ? »** → Non prévu au MVP (VTC uniquement), mais l'architecture ne l'exclut pas structurellement pour plus tard (`02-architecture-fonctionnelle.md` §6) — à ne pas promettre, juste ne pas fermer la porte.

## Actions de clôture

1. Si le partenaire est partant : proposer de signer l'EOI **sur place**, ou fixer une date dans les 48h si les bonnes personnes ne sont pas présentes.
2. Dans tous les cas, repartir avec une prochaine date/action concrète en tête (pas "on se rappelle") — cohérent avec la Phase 0 de `02-proposition-deploiement-pilote.md`.
3. Noter le nom réel de l'opérateur, la ville/zone envisagée, et toute objection non résolue pendant la session, pour mettre à jour ce chantier dès le lundi suivant.

## Après la présentation

Une fois la session passée, ce chantier peut reprendre sur deux issues possibles :
- **EOI signée** → démarrer la Phase 0 du déploiement (`02-proposition-deploiement-pilote.md`) : cadrage réel avec le nom et les couleurs du partenaire, ville/zone, premiers chauffeurs.
- **Pas encore signée / objections à traiter** → capitaliser sur les retours de la session pour ajuster le dossier commercial (modèle économique, périmètre) avant une nouvelle présentation.

Dans les deux cas, SENLINK et les évolutions FlowPOS restent en pause tant que ce point de décision n'est pas passé — à réévaluer une fois l'issue de samedi connue.
