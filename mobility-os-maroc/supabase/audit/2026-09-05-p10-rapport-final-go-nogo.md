# P10 — Rapport final : chantier de finalisation V1 (P0 → P9)

## Verdict

**GO conditionnel pour la Phase 2 (lancement fermé, chauffeurs/passagers
pilotes) — sous réserve de deux conditions bloquantes non levées par ce
chantier (voir ci-dessous). NO-GO pour une ouverture au public tant que
ces deux conditions et le gap L-2 ne sont pas traités.**

La sécurité applicative (identité, isolation multi-tenant, intégrité des
prix, anti-abus) est désormais solide et vérifiée par une suite de
régression automatisée rejouée à chaque étape. Ce n'est cependant pas
suffisant à soi seul pour ouvrir le pilote : deux éléments opérationnels
restent hors de portée de ce chantier, pas par négligence mais parce
qu'ils dépendent de l'utilisateur (un fournisseur SMS réel) ou de
l'environnement d'exécution (accès réseau bloqué dans ce bac à sable).

## Ce qui a été fait (P0 → P9)

| Phase | Contenu | Statut |
|---|---|---|
| P0 | Baseline documentée, audit "Angles Morts" | Fait |
| P0 (C-1/C-2/C-3) | Fuite OTP fermée, fonctions/tables sur-exposées revoke, surveillance push vérifiée | Fait, re-testé |
| P1 (H-1→H-5) | Colonnes dérivées verrouillées, owner_user_id restreint (gap résiduel documenté pour `authenticated` non-propriétaire), audit trail, push/notify sécurisés | Fait, re-testé |
| P1.5 | Grants anon/authenticated re-vérifiés via `get_advisors` à chaque phase (56 lints stables, tous expliqués) | Fait |
| P2 (M-1/M-2) | Invitation à usage unique pour réclamer un opérateur ; proxy serveur pour le géocodage Nominatim | Fait |
| P2 (M-3/M-4) | Lecture publique en masse de `avis_courses` fermée (M-3) ; `pg_net` dans le schéma public évalué, non actionnable (limitation Supabase, documentée) | M-3 fait, M-4 documenté |
| P3 (L-1/L-2) | Coupe-circuit anti-bot global sur `demander_otp` (L-1) ; exposition GPS/adresses via Realtime documentée, correction reportée (changement d'architecture, non testable ici) | L-1 fait, L-2 documenté |
| P4/P4.5 | QA fonctionnelle réelle bloquée (réseau du bac à sable) ; isolation multi-tenant déjà couverte par la matrice de régression (23 cas) | Partiel, documenté |
| P5 | Suite SQL complète rejouée (zéro régression) ; build webapp propre ; lint non configuré (hors périmètre) | Fait |
| P6 | Secrets/CORS/storage/realtime revus ; aucune régression sur les advisors Supabase | Fait |
| P7 | App rendue installable (manifest + icônes PWA, absent jusqu'ici) ; GPS déjà bien implémenté ; Playwright réel bloqué (réseau) | Fait (PWA), partiel (tests réels) |
| P8/P9 | Documentation client livrée (guide opérateur, guide chauffeur, note sécurité non technique) | Fait |

Chaque changement de code a été validé par un test en `begin;...rollback;`
contre le vrai projet Supabase avant application permanente, puis par une
ré-exécution complète de la suite de régression (zéro régression détectée
à chaque étape). Tous les commits sont atomiques et documentés
individuellement (voir l'historique git de la branche
`claude/mobility-os-maroc-priority-x9dkuw`, fast-forwardée dans `main` à
chaque étape).

## Ce qui bloque encore la Phase 2 (conditions du GO)

1. **Aucun fournisseur SMS réel configuré.** `envoyer_sms_otp()` est prêt
   mais no-op tant que `SMS_WEBHOOK_SECRET`/`SMS_PROVIDER_ACCOUNT_SID`/
   `AUTH_TOKEN`/`FROM_NUMBER` ne sont pas renseignés dans Supabase Vault —
   volontairement jamais fait par cette session (identifiants réels
   requis, jamais inventés). **Sans ça, aucun vrai chauffeur ou passager
   ne peut recevoir de code de connexion.** Bloquant pour la Phase 2 elle-
   même, pas seulement pour un lancement public.
2. **Aucun test réel en navigateur n'a été exécuté.** Ce bac à sable ne
   peut atteindre ni Supabase ni Vercel (politique réseau de
   l'environnement, confirmé à plusieurs reprises). Tous les correctifs de
   ce chantier ont été vérifiés au niveau base de données (SQL), jamais en
   cliquant réellement dans les 3 apps. Une passe de QA manuelle est
   nécessaire avant d'impliquer de vrais chauffeurs pilotes.

## Ce qui reste un gap connu, accepté pour un pilote mais à fermer avant le public

- **L-2** : coordonnées GPS et adresses de toutes les courses actives/
  récentes lisibles publiquement (nécessaire au dispatch temps réel sans
  session Auth) — recommandation déjà documentée (Realtime Broadcast +
  Authorization), non implémentée (changement d'architecture, risque trop
  élevé à faire à l'aveugle sans accès réseau pour tester).
- **M-4** : `pg_net` dans le schéma `public` — limitation de la plateforme
  Supabase elle-même (extension non relocalisable), sans impact réel
  puisque les fonctions appelées vivent déjà dans un schéma dédié.
- **H-2 résiduel** : un compte `authenticated` sans opérateur pourrait
  encore lire `owner_user_id` d'un opérateur qui n'est pas le sien
  (nécessaire pour ne pas casser le CRUD chauffeurs/zones du dashboard).

## Prochaines étapes recommandées

1. Fournir les identifiants d'un fournisseur SMS réel (Twilio ou
   équivalent) — débloque immédiatement la Phase 2.
2. Exécuter une passe de QA manuelle complète (les 3 apps, vrais
   téléphones) depuis un environnement avec accès réseau — recommandations
   détaillées dans `2026-09-05-p4-p4.5-qa-fonctionnelle.md` et
   `2026-09-05-p7-ux-mobile.md`.
3. Une fois 1 et 2 faits : Phase 2 (lancement fermé, 5-10 chauffeurs
   pilotes) peut démarrer.
4. Avant une ouverture publique : traiter L-2 (migration Realtime
   Broadcast + Authorization).
