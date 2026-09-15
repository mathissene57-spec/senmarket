do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_assign_agent_point_relais'
  ) then
    raise exception 'PREFLIGHT FAILED: admin_assign_agent_point_relais existe déjà';
  end if;
  if exists (
    select 1 from pg_constraint where conname = 'user_roles_user_id_role_key'
  ) then
    raise exception 'PREFLIGHT FAILED: contrainte unique déjà présente';
  end if;
end;
$preflight$;

-- Écran admin manquant découvert en ajoutant la réception au point relais
-- (at_hub -> at_pickup_point, migration 20260912260000) : aucun agent réel
-- n'a de hub_id assigné en production, et aucune UI n'existe pour le faire
-- (add_team_member/get_team_members ne gèrent que l'équipe transporteur).
-- Sans ça, l'étape at_hub reste inatteignable en pratique.
--
-- Contrainte d'unicité sur (user_id, role) : record_shipment_event,
-- agent_lookup_shipment et is_admin() tolèrent déjà une éventuelle
-- ambiguïté par une exception explicite ("non supporté en v1.0"), mais
-- rien n'empêchait qu'elle se produise, et le upsert ci-dessous
-- (ON CONFLICT) en a besoin pour être correct. Aucune ligne existante ne
-- viole cette contrainte (vérifié avant application : 0 doublon).
alter table public.user_roles
  add constraint user_roles_user_id_role_key unique (user_id, role);

-- Lecture : auth.users/profiles ne sont pas accessibles au client (comme
-- pour get_team_members, qui existe pour la même raison côté transporteur).
create or replace function public.admin_list_agent_point_relais()
returns table(user_id uuid, email text, full_name text, pickup_point_id uuid, hub_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;

  return query
  select ur.user_id, u.email::text, p.full_name, ur.pickup_point_id, ur.hub_id, ur.created_at
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  left join public.profiles p on p.id = ur.user_id
  where ur.role = 'agent_point_relais'
  order by ur.created_at asc;
end;
$function$;

grant execute on function public.admin_list_agent_point_relais() to authenticated;

-- Écriture : upsert par email (résolution email -> user_id nécessite
-- SECURITY DEFINER, même schéma que add_team_member). L'UI envoie
-- toujours l'état complet souhaité (les deux champs), donc un upsert qui
-- écrase pickup_point_id/hub_id à chaque appel est correct — pas de
-- sémantique "patch partiel" à gérer ici.
create or replace function public.admin_assign_agent_point_relais(p_email text, p_pickup_point_id uuid default null, p_hub_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  on conflict (user_id, role) do update
    set pickup_point_id = excluded.pickup_point_id,
        hub_id = excluded.hub_id
  returning id into v_row_id;

  return v_row_id;
end;
$function$;

grant execute on function public.admin_assign_agent_point_relais(text, uuid, uuid) to authenticated;
