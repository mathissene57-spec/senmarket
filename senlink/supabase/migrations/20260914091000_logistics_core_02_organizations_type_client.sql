do $preflight$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.organizations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%client%'
  ) then
    raise exception 'PREFLIGHT FAILED: organizations.type contient déjà client';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 2/12 (organizations.type, décision 2).
-- Ajoute 'client' : décrit une organisation qui consomme le Core en pur
-- suivi (Holding Gueye), sans opérer de hub/point relais/flotte. Choix
-- délibéré de 'client' plutôt que 'visibility' — le type décrit la nature
-- de l'organisation, pas ses permissions (celles-ci vivent dans
-- user_roles.role, cf. étape 3).
alter table public.organizations drop constraint organizations_type_check;
alter table public.organizations add constraint organizations_type_check
  check (type = any (array['transporteur','point_relais_operator','hub_operator','platform','client']));
