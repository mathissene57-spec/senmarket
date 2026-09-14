do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='transport_legs') then
    raise exception 'PREFLIGHT FAILED: transport_legs existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 10/12 (transport_legs, modèle
-- redessiné suite à la revue §C.1) : shipment_id et container_id tous
-- deux nullable, CHECK XOR (exactement un propriétaire). Couvre les 5
-- scénarios A-E sans dupliquer un trajet par shipment quand un container
-- en groupe plusieurs (le container porte le leg, les shipments
-- l'héritent via shipment_containers). Vérifié en simulation rollback-safe
-- : rejet si aucun propriétaire, rejet si les deux, org_viewer voit les
-- legs de son container sans droit direct sur un shipment sans rapport.
create table public.transport_legs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments(id),
  container_id uuid references public.containers(id),
  leg_order smallint not null default 1,
  transport_mode text not null check (transport_mode = any (array['ROAD','SEA','AIR','RAIL','OTHER'])),
  origin_label text not null,
  destination_label text not null,
  origin_port_id text references public.ports(code),
  destination_port_id text references public.ports(code),
  origin_hub_id uuid references public.hubs(id),
  destination_hub_id uuid references public.hubs(id),
  status text not null default 'planned' check (status = any (array['planned','in_progress','completed','cancelled'])),
  planned_departure timestamptz,
  planned_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_legs_owner_xor check ((shipment_id is not null) <> (container_id is not null))
);

create trigger trg_transport_legs_updated_at
  before update on public.transport_legs
  for each row execute function public.set_updated_at();

create index idx_transport_legs_shipment_id on public.transport_legs(shipment_id);
create index idx_transport_legs_container_id on public.transport_legs(container_id);

alter table public.transport_legs enable row level security;

create policy transport_legs_select on public.transport_legs
  for select using (
    (shipment_id is not null and public.can_access_shipment(shipment_id))
    or (container_id is not null and public.can_access_container(container_id))
  );
