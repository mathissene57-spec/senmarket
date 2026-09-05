# P5 : regression finale (build + tests)

## Suite de tests SQL (`supabase/tests/regression.sql`)

Executee integralement de bout en bout contre le projet Supabase reel
(`hfybtcyhhzgwirtqdqmt`), dans une transaction `begin;...rollback;`
(aucune donnee de test ne persiste). **Zero regression** -- couvre :

- 13 tests RPC de cycle de vie (creation/acceptation/transitions/
  annulation/notation d'une course, timeout dispatch, rayon de recherche
  progressif, OTP, rate limiting par numero).
- Permissions anon (insert/update direct bloques, RPC invite fonctionnelles).
- Grants authenticated (regression owner_user_id corrigee).
- Panneau admin (anon bloque, non-admin rejete, admin reel fonctionnel).
- Cloture manuelle d'une course bloquee (proprietaire uniquement).
- Isolation cross-operateur (accepter_course, P0.1).
- Policy de lecture publique des courses recentes (P0.2, gap documente).
- Audit trail course_events (sequence complete, acteur correct par etape).
- proposer_course/refuser_course (isolation cross-operateur).
- Dispatch/GPS (position_recente, courses bloquees).
- Matrice multi-tenant elargie (23 cas : branding, tarifs, configuration,
  chauffeurs, courses, evenements, administration).
- P0.4 : re-test d'attaque complet post C-1/C-2/C-3/H-1/H-2/H-4/H-5.
- H-3 : limite d'une course active par passager.
- M-1 : invitation a usage unique pour reclamer_operateur.
- M-3 : fermeture de la lecture publique en masse de avis_courses.
- L-1 : coupe-circuit anti-bot global sur demander_otp.

## Build webapp (`npm run build`)

Compile et type-check sans erreur. 10 routes generees (9 statiques/1
dynamique + `/api/geocoder` dynamique). Aucune regression TypeScript
introduite par les changements frontend de ce chantier (M-2 : proxy
geocodage).

## Lint (`npm run lint`)

**Non execute** : ESLint n'a jamais ete configure dans ce depot (`next
lint` demande une configuration interactive au premier lancement -- aucun
`.eslintrc*` n'existe). Configurer ESLint pour la premiere fois est hors
perimetre de ce chantier de securite/hardening ; a faire separement si
souhaite, avec l'accord explicite de l'utilisateur (nouvelle dependance/
configuration).

## Conclusion

Aucune regression detectee sur les correctifs P0 a P3 (C-1/C-2/C-3, H-1 a
H-5, M-1 a M-4, L-1/L-2). Le build de production est sain. Les limites
documentees ailleurs (P4 : QA fonctionnelle reelle bloquee par le reseau
du bac a sable ; M-4 : pg_net non relocalisable ; L-2 : exposition GPS/
adresses via Realtime, changement d'architecture requis) restent valables
et ne sont pas des regressions de ce chantier -- ce sont des gaps
pre-existants ou des limitations d'environnement, documentes explicitement.
