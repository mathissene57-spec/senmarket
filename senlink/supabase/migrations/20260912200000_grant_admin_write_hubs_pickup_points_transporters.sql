-- Les policies RLS d'écriture (hubs_admin_write, pickup_points_admin_write,
-- transporters_admin_write, toutes ALL/is_admin()) existaient déjà mais
-- n'avaient aucun effet : seul GRANT SELECT avait été fait vers
-- `authenticated` sur ces trois tables, donc Postgres rejetait tout INSERT/
-- UPDATE/DELETE au niveau des privilèges de base, avant même que RLS ne
-- soit évaluée. Cette migration accorde les privilèges manquants ; RLS
-- (is_admin()) reste la vraie barrière empêchant un non-admin d'écrire —
-- vérifié par simulation SQL rollback-safe (admin autorisé, client bloqué)
-- avant application.
grant insert, update, delete on public.hubs to authenticated;
grant insert, update, delete on public.pickup_points to authenticated;
grant insert, update, delete on public.transporters to authenticated;
