# Baseline pré-P0 — 2026-09-05

Snapshot documenté avant les correctifs de sécurité C-1/C-2/C-3/H-1/H-2/H-4/H-5
(cf. audit du même jour, rapport "Angles Morts"). Toutes les données ci-dessous
proviennent de requêtes live sur le projet Supabase `hfybtcyhhzgwirtqdqmt`
(mobility-os-maroc) — aucune autre base n'a été interrogée.

## Git

- Branche : `claude/mobility-os-maroc-priority-x9dkuw` (à jour avec origin)
- Dernier commit avant P0 : `e1fcf5a` (sondage de secours chauffeur)
- Working tree : propre, aucune modification non commitée

## Données réelles en base (pilote actif)

| Table | Lignes |
|---|---|
| operateurs | 2 (TransAtlas, Toure transport — tous deux déjà réclamés) |
| chauffeurs | 5 |
| passagers | 7 |
| courses | 201 |
| course_events | 423 |
| avis_courses | 22 |
| messages_course | 24 |
| otp_codes | 68 |
| push_subscriptions | 3 |
| admin_plateforme | 1 |

Toutes ces tables ont RLS activé. C'est un pilote avec de vraies données —
chaque correctif ci-après est vérifié pour ne casser aucun de ces
enregistrements existants.

## Vault (secrets déjà présents avant P0)

- `PUSH_WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Aucun secret SMS n'existe encore — confirmé avant d'écrire le correctif C-1.

## Fonctions RPC (40 avant P0), toutes SECURITY DEFINER / search_path=''

Liste complète et statut des grants anon/authenticated : voir le rapport
d'audit "Angles Morts" du 2026-09-05, section "Matrice grants × surface".
Points de départ pour P0 :

- `demander_otp(p_telephone text) returns text` — **renvoie le code en clair**
  (C-1, corrigé par la migration `20260905010000`).
- `declencher_push(p_telephone text, p_titre text, p_corps text)` — accordée à
  anon/authenticated/public alors qu'aucune vérification interne n'existe
  (C-2, corrigé par `20260905020000`).
- `notifier_etape_course()`, `notifier_nouveau_message()`,
  `notifier_nouvelle_course()`, `recalculer_nb_courses_chauffeur()` — fonctions
  trigger accordées à anon/authenticated/public (H-5, même migration).

## Policies RLS (avant P0)

`avis_lecture_publique`, `chauffeurs_gestion_owner`, `chauffeurs_lecture_publique`,
`chauffeurs_maj_owner`, `chauffeurs_suppression_owner`, `courses_lecture_recente`
(anon uniquement), `operateurs_lecture_publique`, `operateurs_maj_owner`,
`zones_gestion_delete_owner`, `zones_gestion_insert_owner`,
`zones_gestion_update_owner`, `zones_lecture_publique`.

`course_events`, `otp_codes`, `messages_course`, `push_subscriptions`,
`admin_plateforme`, `passagers` : RLS activé, **aucune policy** — mais
`course_events` conserve des grants bruts pour anon/authenticated (H-4,
corrigé par `20260905020000`), contrairement aux autres qui sont déjà
correctement verrouillées au niveau grant.

## Grants ciblés par H-1/H-2

- `chauffeurs.note_moyenne`, `chauffeurs.nb_courses` : `UPDATE` accordé à
  `authenticated` sans restriction de colonne (H-1).
- `operateurs.owner_user_id` : `SELECT` accordé à `anon` et `authenticated`
  (H-2).

Corrigés par la migration `20260905030000`.
