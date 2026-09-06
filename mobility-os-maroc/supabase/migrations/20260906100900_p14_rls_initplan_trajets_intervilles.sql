-- P14 (priorite 2/5) : aligne les 3 policies proprietaire de trajets_intervilles
-- (P11, migration recente) sur le pattern deja applique partout ailleurs dans
-- ce schema (chauffeurs, operateurs, produits...) -- wrapper auth.uid() dans
-- un sous-select evite sa reevaluation ligne par ligne par le planner.
-- Purement une optimisation : la condition logique est strictement identique,
-- aucun changement de comportement d'acces. La policy de lecture publique
-- (qual = true, sans appel a auth.uid()) n'est pas concernee.
--
-- Verifie post-migration : get_advisors(performance) ne remonte plus les 3
-- alertes auth_rls_initplan sur trajets_intervilles ; relecture de
-- pg_policies confirme une logique IN (...) strictement identique, seul
-- l'appel a auth.uid() est desormais enveloppe dans (select auth.uid()).

alter policy trajets_intervilles_gestion_insert_owner on public.trajets_intervilles
  with check (operateur_id in (select operateurs.id from public.operateurs where operateurs.owner_user_id = (select auth.uid())));

alter policy trajets_intervilles_gestion_update_owner on public.trajets_intervilles
  using (operateur_id in (select operateurs.id from public.operateurs where operateurs.owner_user_id = (select auth.uid())))
  with check (operateur_id in (select operateurs.id from public.operateurs where operateurs.owner_user_id = (select auth.uid())));

alter policy trajets_intervilles_gestion_delete_owner on public.trajets_intervilles
  using (operateur_id in (select operateurs.id from public.operateurs where operateurs.owner_user_id = (select auth.uid())));
