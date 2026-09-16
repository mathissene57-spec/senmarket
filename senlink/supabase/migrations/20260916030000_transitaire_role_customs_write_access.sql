-- SenLink — élargit la saisie du statut douanier aux transitaires partenaires
--
-- Décision produit (16/09/2026) : suite à container_customs_tracking
-- (saisie manuelle par un admin uniquement), le client demande d'élargir
-- l'accès en écriture à un "transitaire partenaire" -- la personne qui,
-- dans la vraie vie, apprend le statut douanier directement du courtier/
-- terminal, sans qu'un admin SenLink serve d'intermédiaire de saisie.
--
-- Modélisation : un transitaire n'est PAS un type d'organisation (il ne
-- possède pas de conteneurs) -- c'est un rôle utilisateur, exactement comme
-- org_viewer (déjà en place), scopé par user_roles.organization_id vers
-- l'organisation CLIENTE dont il traite les conteneurs (ex. Holding Gueye).
-- Un même transitaire peut être affecté à plusieurs organisations clientes
-- (plusieurs lignes user_roles) -- pas d'index unique single-org comme pour
-- agent_point_relais/transporteur : la contrainte unique déjà en place
-- (user_id, role, organization_id) suffit.
--
-- Portée : la LECTURE des conteneurs de son organisation est déjà couverte
-- par containers_org_select (n'importe quel rôle avec organization_id
-- correspondant) et par organizations_public_read (idem, posée le 15/09
-- pour l'isolation tenant M6) -- aucun changement nécessaire sur ces deux
-- policies. Le seul AJOUT nécessaire est l'ÉCRITURE du statut douanier :
-- record_container_customs_event est étendu pour accepter is_admin() OU un
-- transitaire scopé à l'organisation du conteneur, au lieu de admin
-- uniquement. can_record_customs_event() est un nouveau prédicat, miroir
-- de can_access_container (même style : SQL STABLE, non-SECURITY DEFINER,
-- auth.uid()/is_admin() non enveloppés) mais restreint au rôle transitaire
-- (org_viewer/client ne doivent PAS pouvoir écrire, seulement lire).
--
-- admin_assign_transitaire / admin_list_transitaires suivent exactement le
-- gabarit déjà en place pour admin_assign_agent_point_relais /
-- admin_list_agent_point_relais (même schéma : résolution email->user_id
-- SECURITY DEFINER, is_admin() interne, upsert par contrainte unique).
--
-- Testé en transaction annulée avant application (deux passes séparées) :
-- transitaire scopé à l'organisation du conteneur accepté ; transitaire
-- d'une AUTRE organisation rejeté ; utilisateur sans aucun rôle rejeté ;
-- anon rejeté ; admin toujours accepté quel que soit son organization_id
-- (NULL) ; admin_assign_transitaire upsert idempotent (même id retourné) ;
-- admin_list_transitaires renvoie bien email/full_name/organization_name
-- joints ; appel par un non-admin rejeté. Aucune ligne réelle affectée
-- (rollback systématique), état de MSKU7478609 vérifié inchangé après coup.

do $preflight$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'user_roles_role_check'
      and pg_get_constraintdef(oid) ilike '%transitaire%'
  ) then
    raise exception 'PREFLIGHT FAILED: user_roles_role_check contient déjà transitaire';
  end if;
  if exists (select 1 from pg_proc where proname = 'admin_assign_transitaire') then
    raise exception 'PREFLIGHT FAILED: admin_assign_transitaire existe déjà';
  end if;
end;
$preflight$;

alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['client','agent_point_relais','transporteur','admin','org_viewer','transitaire']));

alter table public.user_roles
  add constraint user_roles_transitaire_requires_org
  check (role != 'transitaire' or organization_id is not null);

create or replace function public.can_record_customs_event(p_container_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1 from public.containers c
    where c.id = p_container_id
      and (
        public.is_admin()
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'transitaire'
            and ur.organization_id = c.organization_id
        )
      )
  );
$function$;

create or replace function public.record_container_customs_event(
  p_container_id uuid,
  p_customs_status text,
  p_location_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_event_type text;
begin
  if not exists (select 1 from public.containers where id = p_container_id) then
    raise exception 'conteneur introuvable';
  end if;
  if not public.can_record_customs_event(p_container_id) then
    raise exception 'opération réservée à un administrateur ou à un transitaire affecté à ce conteneur';
  end if;
  if p_customs_status not in ('pending', 'on_hold', 'cleared') then
    raise exception 'statut douanier invalide : %', p_customs_status;
  end if;

  v_event_type := case p_customs_status
    when 'pending' then 'customs_pending'
    when 'on_hold' then 'customs_hold'
    when 'cleared' then 'customs_cleared'
  end;

  insert into public.container_events (container_id, event_type, location_text, source)
  values (p_container_id, v_event_type, p_location_text, 'manual')
  returning id into v_event_id;

  update public.containers set customs_status = p_customs_status where id = p_container_id;

  return v_event_id;
end;
$function$;

create or replace function public.admin_list_transitaires()
returns table(user_id uuid, email text, full_name text, organization_id uuid, organization_name text, created_at timestamptz)
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
  select ur.user_id, u.email::text, p.full_name, ur.organization_id, o.name, ur.created_at
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  left join public.profiles p on p.id = ur.user_id
  left join public.organizations o on o.id = ur.organization_id
  where ur.role = 'transitaire'
  order by ur.created_at asc;
end;
$function$;

create or replace function public.admin_assign_transitaire(p_email text, p_organization_id uuid)
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

  if p_email is null or trim(p_email) = '' then
    raise exception 'email requis';
  end if;
  if p_organization_id is null then
    raise exception 'organisation cliente requise';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organisation introuvable';
  end if;

  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_target_user_id is null then
    raise exception 'aucun compte SenLink trouvé pour cet email — cette personne doit d''abord créer un compte';
  end if;

  insert into public.user_roles (user_id, role, organization_id)
  values (v_target_user_id, 'transitaire', p_organization_id)
  on conflict (user_id, role, organization_id) do update
    set organization_id = excluded.organization_id
  returning id into v_row_id;

  return v_row_id;
end;
$function$;

revoke execute on function public.admin_list_transitaires() from public, anon;
grant execute on function public.admin_list_transitaires() to authenticated;

revoke execute on function public.admin_assign_transitaire(text, uuid) from public, anon;
grant execute on function public.admin_assign_transitaire(text, uuid) to authenticated;
