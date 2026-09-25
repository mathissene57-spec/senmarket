-- SenLink — backlog M6 (partiel) : isole les organisations de type 'client' entre elles
--
-- Décision produit (confirmée le 15/09/2026, en réponse au constat d'audit documenté
-- dans docs/migration6-visibility-matrix.md) :
-- 1) Le référentiel réseau (hubs, pickup_points, transporters) RESTE partagé, visible par
--    tout acteur authentifié -- SenLink est un seul réseau opérationnel, pas plusieurs
--    réseaux concurrents à cloisonner entre eux. Aucun changement sur ces 3 tables.
-- 2) La table organizations, en revanche, doit cloisonner les organisations de type
--    'client' entre elles : si une deuxième organisation cliente s'inscrit un jour à côté
--    d'un premier client (ex. Holding Gueye), elle ne doit pas pouvoir découvrir son
--    existence (nom, type) via cette table. Les organisations non-'client'
--    (transporteur/point_relais_operator/hub_operator/platform) restent visibles à tous,
--    cohérent avec la décision 1 -- ce sont les mêmes acteurs du réseau partagé.
--
-- Portée strictement limitée à cette policy SELECT. Colonnes sensibles (email/phone,
-- déjà signalées dans la matrice M6 comme candidates à un GRANT colonne admin-only) :
-- hors périmètre de cette migration, non traitées ici.
--
-- Aucun risque de régression applicatique : aucune ligne de code de senlink/app ou
-- senlink/components ne référence la table organizations (vérifié par recherche sur tout
-- le répertoire) -- la capacité Logistics Core n'a encore aucune UI branchée dessus.
--
-- Testé en transaction annulée avant application : org réseau (non-client) toujours
-- visible à tout le monde ; un org_viewer voit sa propre organisation cliente mais pas une
-- organisation cliente concurrente ; un client sans affiliation ne voit aucune organisation
-- cliente ; l'admin voit tout. Une seule organisation réelle existe à ce jour (Atlas Cargo
-- Test Org, type transporteur) -- aucune organisation cliente réelle n'existe encore, donc
-- aucune donnée réelle n'est affectée par ce changement.

do $preflight$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_public_read'
    and qual ilike '%user_roles%'
  ) then
    raise exception 'PREFLIGHT FAILED: organizations_public_read isole déjà les clients';
  end if;
end;
$preflight$;

alter policy organizations_public_read on public.organizations
using (
  type <> 'client'
  or (select is_admin())
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
    and ur.organization_id = organizations.id
  )
);
