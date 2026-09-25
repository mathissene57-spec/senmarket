do $preflight$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_user_id_role_key') then
    raise exception 'PREFLIGHT FAILED: user_roles_user_id_role_key déjà absente';
  end if;
  if exists (select 1 from pg_indexes where indexname = 'user_roles_single_org_roles_key') then
    raise exception 'PREFLIGHT FAILED: index partiel déjà présent';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 1/12 (user_roles, décision 1).
-- La contrainte globale (user_id, role), ajoutée le 12/09 pour fiabiliser
-- l'upsert de admin_assign_agent_point_relais, empêchait un même
-- utilisateur de tenir un rôle sur plusieurs organisations — bloquant
-- pour le multi-tenant (org_viewer). Remplacée par un index unique
-- PARTIEL, restreint aux rôles réellement single-org en v1
-- (agent_point_relais, transporteur) : record_shipment_event et
-- agent_lookup_shipment supposent 1 seule affiliation pour ces rôles
-- (SELECT ... INTO STRICT). admin/client restent libres d'avoir
-- plusieurs lignes (is_admin() est EXISTS-based, pas STRICT).
alter table public.user_roles drop constraint user_roles_user_id_role_key;

create unique index user_roles_single_org_roles_key
  on public.user_roles (user_id, role)
  where role in ('agent_point_relais', 'transporteur');

-- org_viewer (activé à l'étape 3) devra toujours porter une organisation :
-- sans ce CHECK, la contrainte (user_id, role, organization_id) existante
-- ne protégerait rien pour ce rôle si organization_id restait NULL (NULL
-- <> NULL en SQL, donc deux lignes NULL ne se bloquent pas mutuellement).
alter table public.user_roles
  add constraint user_roles_org_viewer_requires_org
  check (role != 'org_viewer' or organization_id is not null);

-- Correction découverte en simulation rollback-safe : un ON CONFLICT nu
-- ne matche pas un index unique partiel (erreur 42P10) — il doit répéter
-- exactement la clause WHERE de l'index pour que Postgres l'accepte
-- comme arbitre. Signature et comportement observable inchangés.
create or replace function public.admin_assign_agent_point_relais(p_email text, p_pickup_point_id uuid default null::uuid, p_hub_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_target_user_id uuid;
  v_row_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;

  if p_pickup_point_id is null and p_hub_id is null then
    raise exception 'au moins un point relais ou un hub doit être renseigné';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'email requis';
  end if;

  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_target_user_id is null then
    raise exception 'aucun compte SenLink trouvé pour cet email — cette personne doit d''abord créer un compte';
  end if;

  insert into public.user_roles (user_id, role, pickup_point_id, hub_id)
  values (v_target_user_id, 'agent_point_relais', p_pickup_point_id, p_hub_id)
  on conflict (user_id, role) where role in ('agent_point_relais', 'transporteur') do update
    set pickup_point_id = excluded.pickup_point_id,
        hub_id = excluded.hub_id
  returning id into v_row_id;

  return v_row_id;
end;
$function$;
