do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='ports') then
    raise exception 'PREFLIGHT FAILED: ports existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 4/12 (référentiel ports).
-- Objet référentiel pur, distinct de hubs (un port n'est l'opéré de
-- personne dans le réseau). Même pattern RLS que countries/corridors :
-- lecture publique, écriture is_admin() en 3 policies séparées.
-- AUCUN SEED — discipline explicitement demandée avant toute migration :
-- schéma prêt, entrées ajoutées une par une avec code UN/LOCODE confirmé.
create table public.ports (
  code text primary key,
  name text not null,
  city text,
  country text references public.countries(code),
  lat numeric,
  lng numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ports enable row level security;

create policy ports_public_read on public.ports
  for select using (true);

create policy ports_admin_insert on public.ports
  for insert with check ((select public.is_admin()));

create policy ports_admin_update on public.ports
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

create policy ports_admin_delete on public.ports
  for delete using ((select public.is_admin()));
