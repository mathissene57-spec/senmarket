do $preflight$
begin
  if exists (select 1 from pg_proc where proname='register_container' and pronamespace='public'::regnamespace) then
    raise exception 'PREFLIGHT FAILED: register_container existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 11/12 (RPC d'écriture).
-- Infrastructure only : aucune règle métier sur "qui peut créer un
-- container pour son organisation" n'a été tranchée (pas de vertical/UI
-- construite à ce stade) — toutes admin-gated pour l'instant, comme
-- definir_ordre_accueil ou les autres utilitaires admin-only du Core.
-- record_container_event ne projette délibérément pas sur
-- containers.current_status/eta — cette logique de projection est une
-- décision de vertical, pas de plomberie d'infrastructure.

create or replace function public.resolve_container_carrier(p_container_number text)
returns text
language sql
stable
set search_path = ''
as $function$
  select cp.shipping_line_name
  from public.carrier_prefixes cp
  where cp.prefix = upper(left(trim(p_container_number), 4));
$function$;

grant execute on function public.resolve_container_carrier(text) to authenticated, anon;

create or replace function public.register_container(
  p_organization_id uuid,
  p_container_number text,
  p_container_type text default null,
  p_carrier_prefix text default null,
  p_vessel_name text default null,
  p_voyage_number text default null,
  p_origin_port_id text default null,
  p_destination_port_id text default null,
  p_tracking_provider_id uuid default null,
  p_external_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;
  insert into public.containers (
    organization_id, container_number, container_type, carrier_prefix,
    vessel_name, voyage_number, origin_port_id, destination_port_id,
    tracking_provider_id, external_ref, created_by
  ) values (
    p_organization_id, p_container_number, p_container_type, p_carrier_prefix,
    p_vessel_name, p_voyage_number, p_origin_port_id, p_destination_port_id,
    p_tracking_provider_id, p_external_ref, auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$function$;

revoke execute on function public.register_container(uuid,text,text,text,text,text,text,text,uuid,text) from public, anon;
grant execute on function public.register_container(uuid,text,text,text,text,text,text,text,uuid,text) to authenticated;

create or replace function public.record_container_event(
  p_container_id uuid,
  p_event_type text,
  p_event_time timestamptz default now(),
  p_location_port_id text default null,
  p_location_text text default null,
  p_source text default 'manual',
  p_raw_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;
  if not exists (select 1 from public.containers where id = p_container_id) then
    raise exception 'conteneur introuvable';
  end if;
  insert into public.container_events (
    container_id, event_type, event_time, location_port_id, location_text,
    source, raw_payload, metadata
  ) values (
    p_container_id, p_event_type, p_event_time, p_location_port_id, p_location_text,
    p_source, p_raw_payload, p_metadata
  )
  returning id into v_id;
  return v_id;
end;
$function$;

revoke execute on function public.record_container_event(uuid,text,timestamptz,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.record_container_event(uuid,text,timestamptz,text,text,text,jsonb,jsonb) to authenticated;

create or replace function public.link_shipment_container(p_shipment_id uuid, p_container_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;
  insert into public.shipment_containers (shipment_id, container_id)
  values (p_shipment_id, p_container_id)
  on conflict (shipment_id, container_id) do nothing
  returning id into v_id;
  return v_id;
end;
$function$;

revoke execute on function public.link_shipment_container(uuid,uuid) from public, anon;
grant execute on function public.link_shipment_container(uuid,uuid) to authenticated;
