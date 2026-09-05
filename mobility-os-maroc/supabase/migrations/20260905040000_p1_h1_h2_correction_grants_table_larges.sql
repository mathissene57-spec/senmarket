-- Correction de la migration 20260905030000 : le REVOKE cible par colonne
-- (`revoke update (note_moyenne, nb_courses) on chauffeurs from authenticated`
-- / `revoke select (owner_user_id) on operateurs from anon, authenticated`)
-- s'est revele sans effet -- confirme par requete live sur
-- information_schema.column_privileges apres application. Cause racine :
-- authenticated/anon detenaient un GRANT au niveau TABLE ENTIERE (pas par
-- colonne) sur ces deux tables ; un REVOKE cible par colonne ne peut pas
-- reduire un privilege deja accorde au niveau table (limitation Postgres,
-- pas un bug du projet -- les deux niveaux de grant sont geres
-- independamment). Verifie a blanc (transaction annulee) avant application
-- reelle : la policy RLS operateurs_maj_owner continue de fonctionner
-- correctement meme sans SELECT/UPDATE direct sur owner_user_id -- Postgres
-- evalue les predicats RLS independamment des grants de colonne de
-- l'appelant.
--
-- Correctif : REVOKE la table entiere, puis GRANT uniquement les colonnes
-- qui doivent rester accessibles.

-- H-2 : operateurs.owner_user_id ne doit etre lisible par personne cote
-- anon/authenticated (uniquement via les RPC SECURITY DEFINER qui en ont besoin).
revoke select on public.operateurs from anon, authenticated;
grant select (id, nom, slug, logo_url, couleur_primaire, couleur_secondaire, ville, actif, created_at)
  on public.operateurs to anon, authenticated;

-- H-1 : chauffeurs.note_moyenne/nb_courses ne doivent etre modifiables que
-- par les triggers (recalculer_note_chauffeur/recalculer_nb_courses_chauffeur).
-- Toutes les autres colonnes que le dashboard modifie reellement restent
-- ouvertes (nom/telephone/vehicule/plaque/statut a l'edition, position_lat/
-- lng/position_maj_at deja ouvertes avant ce correctif -- aucune restriction
-- nouvelle ajoutee sur ce qui n'est pas concerne par H-1).
revoke update on public.chauffeurs from authenticated;
grant update (id, operateur_id, nom, telephone, vehicule, plaque, statut, created_at, position_lat, position_lng, position_maj_at)
  on public.chauffeurs to authenticated;
