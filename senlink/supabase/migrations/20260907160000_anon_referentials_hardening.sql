-- ============================================================================
-- SENLINK — Migration 6a : Durcissement de l'accès anon aux référentiels
-- (organizations, hubs, pickup_points, transporters)
-- ============================================================================
-- STATUT : DRAFT. NON APPLIQUÉ.
--
-- Contexte : le Discovery Report "Tenant Isolation" (7 sept. 2026) a mis en
-- évidence que `anon` (la clé publique, embarquée côté client dans toute app
-- Supabase) dispose d'un GRANT SELECT au niveau TABLE sur organizations,
-- hubs, pickup_points et transporters — hérité tel quel du schéma initial
-- (senlink_init_schema.sql). Ce grant inclut TOUTES les colonnes, dont
-- organizations.email/phone et pickup_points.phone. Recherche exhaustive
-- dans le code Next.js réel (grep sur .from('organizations')/.from('hubs')/
-- .from('pickup_points')/.from('transporters')) : AUCUN consommateur —
-- seul app/dashboard/page.tsx lit user_roles, une table différente. Les RPC
-- qui lisent ces tables (create_shipment_lot, add_shipment_to_lot, etc.)
-- sont SECURITY DEFINER et contournent déjà leur RLS (propriétaire de
-- table), donc ne dépendent pas de ce grant `anon` non plus.
--
-- Portée strictement limitée à ce point précis (distinct de la question
-- "Tenant Isolation" — Organisation A voit-elle Organisation B ? — qui
-- reste un chantier produit séparé, non traité ici) :
--   - REVOKE SELECT sur ces 4 tables pour `anon` uniquement.
--   - `authenticated` conserve exactement son accès actuel (inchangé).
--   - Aucune policy RLS modifiée, aucune donnée modifiée.
--   - countries/corridors non touchées (référentiels globaux, décision
--     explicite de les traiter séparément).
--   - Aucune fonction/RPC des Migrations 1-5 modifiée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PREFLIGHT
-- ----------------------------------------------------------------------------
do $preflight$
begin
  -- 0.1 Le grant à révoquer doit être exactement celui audité : SELECT au
  --     niveau table pour anon, sur chacune des 4 tables.
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='organizations' and grantee='anon' and privilege_type='SELECT'
  ) then
    raise exception 'PREFLIGHT FAILED: anon n''a pas (ou plus) de SELECT sur organizations — état différent de celui audité';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='hubs' and grantee='anon' and privilege_type='SELECT'
  ) then
    raise exception 'PREFLIGHT FAILED: anon n''a pas (ou plus) de SELECT sur hubs — état différent de celui audité';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='pickup_points' and grantee='anon' and privilege_type='SELECT'
  ) then
    raise exception 'PREFLIGHT FAILED: anon n''a pas (ou plus) de SELECT sur pickup_points — état différent de celui audité';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='transporters' and grantee='anon' and privilege_type='SELECT'
  ) then
    raise exception 'PREFLIGHT FAILED: anon n''a pas (ou plus) de SELECT sur transporters — état différent de celui audité';
  end if;

  -- 0.2 authenticated doit garder son SELECT (on ne le touche pas, mais on
  --     vérifie qu'il est bien présent avant, pour comparaison après coup).
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='organizations' and grantee='authenticated' and privilege_type='SELECT'
  ) then
    raise exception 'PREFLIGHT FAILED: authenticated n''a pas de SELECT sur organizations — état différent de celui audité';
  end if;

  -- 0.3 Les policies RLS publiques doivent être exactement celles auditées
  --     (qual=true) — cette migration ne les touche pas, mais si elles ont
  --     déjà changé, le contexte de cette migration n'est plus valide.
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.organizations'::regclass and polname = 'organizations_public_read'
      and pg_get_expr(polqual, polrelid) = 'true'
  ) then
    raise exception 'PREFLIGHT FAILED: organizations_public_read a changé depuis l''audit';
  end if;
end $preflight$;

-- ----------------------------------------------------------------------------
-- 1. REVOKE — anon uniquement, authenticated inchangé
-- ----------------------------------------------------------------------------
revoke select on public.organizations from anon;
revoke select on public.hubs from anon;
revoke select on public.pickup_points from anon;
revoke select on public.transporters from anon;

-- ============================================================================
-- ROLLBACK EXACT (non exécuté par cette migration)
-- ============================================================================
-- grant select on public.organizations to anon;
-- grant select on public.hubs to anon;
-- grant select on public.pickup_points to anon;
-- grant select on public.transporters to anon;
-- ============================================================================

-- ============================================================================
-- PLAN DE TESTS (après GO d'application, jamais avant)
-- ============================================================================
-- 1. anon direct : select * from organizations / hubs / pickup_points /
--    transporters (rôle anon, transaction rollback) -> doit échouer 42501
--    permission denied pour chacune des 4 tables.
-- 2. authenticated direct : même test avec role authenticated -> doit
--    toujours réussir, résultat identique à avant cette migration (0 ligne,
--    base vide, mais pas d'erreur de permission).
-- 3. Non-régression RPC : create_shipment_lot(), add_shipment_to_lot(),
--    reassign_shipment_lot(), can_access_shipment() -> toujours exécutables,
--    même comportement (ces fonctions sont SECURITY DEFINER et ne dépendent
--    pas du grant anon révoqué ici).
-- 4. countries/corridors : vérifier qu'anon garde son SELECT dessus, INCHANGÉ
--    (cette migration ne les touche pas).
-- 5. get_advisors security : vérifier qu'aucune nouvelle alerte n'apparaît.
-- ============================================================================
