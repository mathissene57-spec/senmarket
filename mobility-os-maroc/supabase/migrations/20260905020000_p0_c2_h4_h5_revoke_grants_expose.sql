-- P0.2 (C-2) + H-4 + H-5 : verrouillage des grants trop larges identifies par
-- l'audit "Angles Morts" du 2026-09-05.
--
-- C-2 : declencher_push(text,text,text) est une fonction ordinaire (pas un
-- trigger) qui envoie un push a un numero et un contenu 100% arbitraires,
-- sans aucune verification interne -- et elle etait accordee a anon. Un
-- appelant anonyme pouvait donc envoyer une notification push a n'importe
-- quel numero abonne, avec un titre/contenu de phishing au choix. Une fois
-- revoquee, seuls les triggers internes (notifier_etape_course,
-- notifier_nouveau_message, notifier_nouvelle_course, qui l'appellent via
-- `perform public.declencher_push(...)`) continuent de fonctionner : ils
-- s'executent avec les droits de leur propre definisseur, jamais ceux de
-- l'appelant externe.
revoke all on function public.declencher_push(text, text, text) from public, anon, authenticated;

-- H-5 : ces quatre fonctions sont des triggers (ou un helper de trigger) et
-- ne doivent jamais etre appelables directement comme RPC -- meme traitement
-- que enregistrer_evenement_course/enregistrer_evenement_notation/
-- recalculer_note_chauffeur, deja correctement verrouilles depuis P1.
revoke all on function public.notifier_etape_course() from public, anon, authenticated;
revoke all on function public.notifier_nouveau_message() from public, anon, authenticated;
revoke all on function public.notifier_nouvelle_course() from public, anon, authenticated;
revoke all on function public.recalculer_nb_courses_chauffeur() from public, anon, authenticated;

-- H-4 : course_events est protegee par "RLS active, aucune policy" (deny-all
-- de fait pour toute lecture/ecriture) mais conservait des grants bruts
-- SELECT/INSERT/UPDATE pour anon et authenticated sur toutes les colonnes,
-- herites des privileges par defaut de ce projet -- protection qui ne tenait
-- qu'a l'absence de policy. Alignee sur otp_codes/push_subscriptions/
-- passagers/messages_course/admin_plateforme, deja correctement revoques.
revoke all on public.course_events from public, anon, authenticated;
