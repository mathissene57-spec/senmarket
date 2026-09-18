-- SenLink — expose la destination finale dans le tracking public
--
-- Demandé (18/09/2026) : le lieu de dépôt/livraison final du conteneur
-- doit apparaître sur le suivi. containers.destination_port_id existe
-- déjà (FK vers ports) mais n'était jamais exposé par public_track_container
-- ni jamais renseigné pour le pilote MSKU7478609. DROP requis (le type de
-- retour change). Testé en transaction annulée avant application.
do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'public_track_container'
    and pg_get_function_result(p.oid) ilike '%destination_label%'
  ) then
    raise exception 'PREFLIGHT FAILED: public_track_container expose déjà destination_label';
  end if;
end;
$preflight$;

drop function public.public_track_container(text);

create function public.public_track_container(p_container_number text)
 returns table(
   container_number text, container_type text, carrier_name text,
   vessel_name text, voyage_number text, current_status text, customs_status text, eta timestamptz,
   destination_label text,
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
    case when dp.name is not null then format('%s, %s', dp.name, dco.name) else null end,
    e.event_type, e.location_text, e.event_time, e.source
  from public.containers c
  left join public.carrier_prefixes cp on cp.prefix = c.carrier_prefix
  left join public.ports dp on dp.code = c.destination_port_id
  left join public.countries dco on dco.code = dp.country
  left join public.container_events e on e.container_id = c.id
  where c.container_number = upper(trim(p_container_number))
  order by e.event_time asc;
$function$;

grant execute on function public.public_track_container(text) to anon, authenticated;
