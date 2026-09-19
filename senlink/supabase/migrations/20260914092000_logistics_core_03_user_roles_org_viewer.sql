do $preflight$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'user_roles_role_check'
      and pg_get_constraintdef(oid) ilike '%org_viewer%'
  ) then
    raise exception 'PREFLIGHT FAILED: user_roles_role_check contient déjà org_viewer';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 3/12 (user_roles.role, décision 3).
-- Nouveau rôle 'org_viewer' : salarié d'une organisation cliente,
-- consultation seule. Ne détourne pas 'client' (propriétaire final d'un
-- shipment). Protégé par le CHECK user_roles_org_viewer_requires_org
-- posé à l'étape 1 (organization_id obligatoire pour ce rôle) — vérifié
-- en simulation : insertion sans organization_id rejetée, avec acceptée.
alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['client','agent_point_relais','transporteur','admin','org_viewer']));
