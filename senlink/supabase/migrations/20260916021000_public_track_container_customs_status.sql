-- SenLink — expose customs_status dans le tracking public
--
-- Complément immédiat de container_customs_tracking : la RPC publique
-- doit refléter le statut douanier saisi manuellement (voir migration
-- précédente), sinon la donnée existe en base mais jamais visible côté
-- utilisateur final. DROP requis (le type de retour change).

do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'public_track_container'
    and pg_get_function_result(p.oid) ilike '%customs_status%'
  ) then
    raise exception 'PREFLIGHT FAILED: public_track_container expose déjà customs_status';
  end if;
end;
$preflight$;

drop function public.public_track_container(text);

create function public.public_track_container(p_container_number text)
 returns table(
   container_number text, container_type text, carrier_name text,
   vessel_name text, voyage_number text, current_status text, customs_status text, eta timestamptz,
   event_type text, event_location text, event_time timestamptz, event_source text
 )
 language sql
 stable
 security definer
 set search_path = ''
as $function$
  select
    c.container_number, c.container_type, cp.shipping_line_name,
    c.vessel_name, c.voyage_number, c.current_status, c.customs_status, c.eta,
    e.event_type, e.location_text, e.event_time, e.source
  from public.containers c
  left join public.carrier_prefixes cp on cp.prefix = c.carrier_prefix
  left join public.container_events e on e.container_id = c.id
  where c.container_number = upper(trim(p_container_number))
  order by e.event_time asc;
$function$;

grant execute on function public.public_track_container(text) to anon, authenticated;
