do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='container_events') then
    raise exception 'PREFLIGHT FAILED: container_events existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 8/12 (container_events).
-- Append-only, même discipline que shipment_events/shipment_lot_events/
-- shipment_lot_locations : une seule policy SELECT, aucune UPDATE/DELETE,
-- écriture réservée aux futures RPC SECURITY DEFINER (étape 12).
create table public.container_events (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.containers(id),
  event_type text not null,
  event_time timestamptz not null default now(),
  location_port_id text references public.ports(code),
  location_text text,
  source text not null check (source = any (array['provider','manual','system'])),
  provider_id uuid references public.tracking_providers(id),
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_container_events_container_id on public.container_events(container_id, event_time desc);

alter table public.container_events enable row level security;

create policy container_events_select on public.container_events
  for select using (public.can_access_container(container_id));
