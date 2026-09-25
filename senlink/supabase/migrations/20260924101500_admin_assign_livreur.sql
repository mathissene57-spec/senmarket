-- SenLink — écran admin manquant pour le rôle livreur (Branche 3), sur le
-- même modèle que admin_assign_agent_point_relais (20260912270000) : la
-- résolution email -> user_id nécessite SECURITY DEFINER (auth.users n'est
-- pas accessible au client). Un livreur n'a besoin d'aucun champ
-- supplémentaire (pas de pickup_point_id/hub_id/transporter_id — il est
-- affecté colis par colis via record_shipment_event, pas via user_roles) :
-- l'upsert se limite donc à garantir la présence de la ligne
-- (user_id, 'livreur'), sans rien à mettre à jour dessus.

do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_assign_livreur'
  ) then
    raise exception 'PREFLIGHT FAILED: admin_assign_livreur existe déjà';
  end if;
end;
$preflight$;

create function public.admin_assign_livreur(p_email text)
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

  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_target_user_id is null then
    raise exception 'aucun compte SenLink trouvé pour cet email — cette personne doit d''abord créer un compte';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_target_user_id, 'livreur')
  on conflict (user_id, role) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    select id into v_row_id from public.user_roles where user_id = v_target_user_id and role = 'livreur';
  end if;

  return v_row_id;
end;
$function$;

grant execute on function public.admin_assign_livreur(text) to authenticated;

create function public.admin_list_livreurs()
returns table(user_id uuid, email text, full_name text, created_at timestamptz)
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
  select ur.user_id, u.email::text, p.full_name, ur.created_at
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  left join public.profiles p on p.id = ur.user_id
  where ur.role = 'livreur'
  order by ur.created_at asc;
end;
$function$;

grant execute on function public.admin_list_livreurs() to authenticated;
