do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='shipment_containers') then
    raise exception 'PREFLIGHT FAILED: shipment_containers existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 9/12 (shipment_containers).
-- Table de liaison N:N — aucune contrainte "1 shipment = 1 container".
-- Lecture accessible via l'un OU l'autre chemin (can_access_shipment /
-- can_access_container) : un salarié org_viewer doit voir les shipments
-- liés à "son" container même sans droit direct sur ces shipments.
-- Aucune policy d'écriture directe (RPC-only, étape 12), même discipline
-- que shipment_lots pour la manipulation de groupages.
create table public.shipment_containers (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  container_id uuid not null references public.containers(id),
  created_at timestamptz not null default now(),
  constraint shipment_containers_shipment_id_container_id_key unique (shipment_id, container_id)
);

create index idx_shipment_containers_shipment_id on public.shipment_containers(shipment_id);
create index idx_shipment_containers_container_id on public.shipment_containers(container_id);

alter table public.shipment_containers enable row level security;

create policy shipment_containers_select on public.shipment_containers
  for select using (
    public.can_access_shipment(shipment_id) or public.can_access_container(container_id)
  );
