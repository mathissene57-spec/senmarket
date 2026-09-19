-- Correctif : returns table(user_id uuid, ...) crée un paramètre OUT
-- implicite nommé user_id, en conflit avec la colonne user_roles.user_id
-- dans la requête interne de lookup de l'appelant. Alias ajouté pour
-- lever l'ambiguïté -- aucun autre changement de comportement.
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
    select * into strict v_actor_ur from public.user_roles ur0
    where ur0.user_id = v_actor and ur0.role = 'transporteur';
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
