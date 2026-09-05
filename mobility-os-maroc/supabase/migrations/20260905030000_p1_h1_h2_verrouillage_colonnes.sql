-- P1 (H-1 + H-2) : verrouillage de colonnes derivees/sensibles identifiees
-- par l'audit "Angles Morts" du 2026-09-05.
--
-- H-1 : chauffeurs.note_moyenne et chauffeurs.nb_courses sont des colonnes
-- calculees (maintenues par les triggers recalculer_note_chauffeur /
-- recalculer_nb_courses_chauffeur) mais la policy RLS chauffeurs_maj_owner ne
-- filtre que par ligne (le chauffeur appartient a mon operateur) -- un
-- operateur proprietaire pouvait ecrire n'importe quelle valeur sur ses
-- propres chauffeurs via un simple UPDATE direct depuis le dashboard
-- (ex: note_moyenne = 5, nb_courses = 900, sans aucun avis reel), cassant le
-- signal de confiance passager. Les triggers continuent de fonctionner (ils
-- s'executent sous leur propre definisseur, pas sous le role authenticated).
revoke update (note_moyenne, nb_courses) on public.chauffeurs from authenticated;

-- H-2 : operateurs.owner_user_id (UUID auth.users du proprietaire) etait
-- lisible par anon et authenticated via la policy publique
-- operateurs_lecture_publique -- fuite d'identite inutile, aucune page de
-- l'app n'a besoin de cette colonne cote public (le frontend ne fait jamais
-- de SELECT direct dessus). reclamer_operateur() et le dashboard tournent
-- deja en SECURITY DEFINER et n'ont pas besoin du grant direct pour
-- fonctionner.
revoke select (owner_user_id) on public.operateurs from anon, authenticated;
