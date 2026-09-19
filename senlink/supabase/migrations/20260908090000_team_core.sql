-- SENLINK — Migration 5 : Équipe transporteur (Team Core)
--
-- Donne à un transporteur un chemin self-service pour composer son
-- équipe (ajouter/retirer un collègue), là où seul un admin pouvait
-- écrire dans user_roles jusqu'ici.
--
-- Décisions produit verrouillées avant cette migration :
--   1. Pas de sous-rôle/titre en V1 — tout membre avec le même
--      transporter_id est symétrique (mêmes droits).
--   2. Ajout par email uniquement si un compte SenLink existe déjà —
--      pas d'invitation par email (aucune Edge Function d'envoi dans
--      ce scaffold).
--   3. Modèle plat — tout membre peut ajouter/retirer un autre membre,
--      aucune notion de "propriétaire" du transporteur.
--
-- Aucune modification des 14 fonctions existantes (Migrations 1-4),
-- aucune modification de RLS existante, aucune nouvelle table.

do $preflight$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'PREFLIGHT FAILED: is_admin() introuvable';
  end if;
  if to_regprocedure('public.get_team_members()') is not null then
    raise exception 'PREFLIGHT FAILED: get_team_members() existe déjà';
  end if;
  if to_regprocedure('public.add_team_member(text,text)') is not null then
    raise exception 'PREFLIGHT FAILED: add_team_member(text,text) existe déjà';
  end if;
  if to_regprocedure('public.remove_team_member(uuid,text)') is not null then
    raise exception 'PREFLIGHT FAILED: remove_team_member(uuid,text) existe déjà';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'transporter_id'
  ) then
    raise exception 'PREFLIGHT FAILED: user_roles.transporter_id introuvable';
  end if;
end;
$preflight$;

-- 1) Lecture de l'équipe (contourne RLS user_roles_self_select, qui
--    n'expose que la ligne de l'appelant lui-même).
create or replace function public.get_team_members()
returns table(user_id uuid, full_name text, email text, joined_at timestamptz)
language plpgsql
security definer
set search_path = ''
stable
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then
      raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then
      raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  return query
  select ur.user_id, p.full_name, u.email::text, ur.created_at
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  left join public.profiles p on p.id = ur.user_id
  where ur.role = 'transporteur' and ur.transporter_id = v_actor_ur.transporter_id
  order by ur.created_at asc;
end;
$function$;

-- 2) Ajout d'un membre existant par email.
create or replace function public.add_team_member(p_email text, p_acting_role text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_target_user_id uuid;
  v_new_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  if public.is_admin() then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then
      raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then
      raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  if v_actor_ur.transporter_id is null then
    raise exception 'transporteur sans fiche transporteur affectée';
  end if;
  if not exists (select 1 from public.transporters where id = v_actor_ur.transporter_id and active) then
    raise exception 'transporteur inactif';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'email requis';
  end if;

  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_target_user_id is null then
    raise exception 'aucun compte SenLink trouvé pour cet email — cette personne doit d''abord créer un compte';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_target_user_id and role = 'transporteur' and transporter_id = v_actor_ur.transporter_id
  ) then
    raise exception 'cette personne fait déjà partie de l''équipe';
  end if;

  begin
    insert into public.user_roles (user_id, role, organization_id, transporter_id)
    values (v_target_user_id, 'transporteur', v_actor_ur.organization_id, v_actor_ur.transporter_id)
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'cette personne a déjà un rôle transporteur pour cette organisation';
  end;

  return v_new_id;
end;
$function$;

-- 3) Retrait d'un membre — jamais le dernier.
create or replace function public.remove_team_member(p_user_id uuid, p_acting_role text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_member_count integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  if public.is_admin() then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then
      raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then
      raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'transporteur' and transporter_id = v_actor_ur.transporter_id
  ) then
    raise exception 'cette personne ne fait pas partie de l''équipe';
  end if;

  select count(*) into v_member_count
  from public.user_roles
  where role = 'transporteur' and transporter_id = v_actor_ur.transporter_id;

  if v_member_count <= 1 then
    raise exception 'impossible de retirer le dernier membre de l''équipe';
  end if;

  delete from public.user_roles
  where user_id = p_user_id and role = 'transporteur' and transporter_id = v_actor_ur.transporter_id;

  return true;
end;
$function$;

-- 4) Grants : anon exclu, authenticated seul (même convention que les
--    RPC Lots/Scans existantes).
revoke execute on function public.get_team_members() from public, anon;
grant execute on function public.get_team_members() to authenticated;

revoke execute on function public.add_team_member(text, text) from public, anon;
grant execute on function public.add_team_member(text, text) to authenticated;

revoke execute on function public.remove_team_member(uuid, text) from public, anon;
grant execute on function public.remove_team_member(uuid, text) to authenticated;
