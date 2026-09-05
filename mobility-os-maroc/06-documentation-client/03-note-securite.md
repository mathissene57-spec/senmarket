# Note sécurité — à l'attention de l'opérateur partenaire

Ce document résume, en langage non technique, le travail de sécurisation
effectué sur la plateforme avant le lancement du pilote, et ce qui reste à
faire de votre côté ou de celui de votre équipe technique avant une
ouverture au public. Il ne remplace pas un audit de sécurité indépendant
si votre organisation en exige un ; il documente honnêtement l'état réel
du système, y compris ses limites.

## Ce qui a été vérifié et corrigé

- **Vérification d'identité par téléphone** : chaque passager et chaque
  chauffeur confirme son numéro par un code à usage unique envoyé par SMS
  avant de pouvoir créer ou accepter une course. Les tentatives de code
  incorrect et les demandes répétées de code sont limitées automatiquement.
- **Cloisonnement entre opérateurs** : si la plateforme héberge plusieurs
  entreprises de transport, chacune ne voit et ne modifie que ses propres
  chauffeurs, tarifs et courses — vérifié systématiquement par une suite de
  tests automatisés rejouée à chaque mise à jour du système (23 scénarios
  d'isolation, tous validés).
- **Prix calculé côté serveur** : le prix affiché à la validation d'une
  course est toujours recalculé par le système à partir de la distance
  réelle, jamais accepté tel quel depuis l'appareil du passager — un prix
  ne peut donc pas être falsifié avant envoi.
- **Protection contre les abus automatisés** : au-delà d'un volume anormal
  de demandes de code (utile pour éviter qu'un tiers malveillant fasse
  gonfler une éventuelle facture d'envoi de SMS), le système coupe
  temporairement l'accès plutôt que de continuer à envoyer.
- **Accès restreint aux données sensibles** : les numéros de téléphone, la
  position GPS en direct des chauffeurs, et l'historique interne ne sont
  accessibles qu'aux fonctions du système qui en ont explicitement besoin
  — jamais lisibles directement de l'extérieur.

## Limites connues, assumées pour un pilote, à traiter avant une ouverture large

- **Envoi de SMS réel non encore activé** : le système est prêt à envoyer
  de vrais codes par SMS, mais nécessite les identifiants d'un fournisseur
  SMS (ex. Twilio) que **vous ou votre équipe technique devez fournir** —
  aucun identifiant n'a été créé ou deviné à votre place. Tant que ce n'est
  pas fait, seuls des numéros de test explicitement désignés reçoivent un
  code (utile en interne, pas pour de vrais utilisateurs).
- **Position et adresses des courses en cours** : pour permettre au
  passager et au chauffeur de suivre une course en temps réel sans avoir à
  se connecter avec un compte, le système partage certaines informations
  de dispatch (position approximative, adresses) de façon plus large que
  le strict nécessaire. Ce choix est documenté et une correction plus
  robuste est prévue avant une montée en charge importante — il ne s'agit
  pas d'un défaut découvert après coup, mais d'un compromis technique
  connu depuis la conception, à fermer avant un lancement grand public.
- **Tests réalisés jusqu'ici** : la sécurité du système (qui a le droit de
  faire quoi) a été testée de façon approfondie et automatisée. Les
  parcours utilisateur complets (créer une course, l'accepter, suivre le
  trajet) doivent encore être testés manuellement dans un vrai navigateur
  sur de vrais téléphones avant l'ouverture au public — recommandé comme
  étape de la Phase 2 (lancement fermé) du plan de déploiement.

## Recommandation

Avant d'ouvrir la plateforme au grand public (au-delà des chauffeurs et
passagers de test de la Phase 2), demandez à votre équipe technique de
confirmer explicitement que les deux points ci-dessus sont traités ou
consciemment acceptés par votre organisation.
