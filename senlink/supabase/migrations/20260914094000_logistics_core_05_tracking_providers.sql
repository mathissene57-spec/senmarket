do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='tracking_providers') then
    raise exception 'PREFLIGHT FAILED: tracking_providers existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 5/12 (tracking_providers).
-- Couche d'abstraction fournisseur (§F Phase 1.1) : config interne,
-- jamais un référentiel public — lecture/écriture réservées à is_admin().
-- config jsonb ne porte que des paramètres non sensibles ; les clés API
-- réelles vivent dans les secrets Edge Function / Supabase Vault, jamais
-- ici. AUCUN SEED — pas de fournisseur codé en dur.
create table public.tracking_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind = any (array['carrier_direct','aggregator','ais','manual'])),
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tracking_providers enable row level security;

create policy tracking_providers_admin_select on public.tracking_providers
  for select using ((select public.is_admin()));

create policy tracking_providers_admin_insert on public.tracking_providers
  for insert with check ((select public.is_admin()));

create policy tracking_providers_admin_update on public.tracking_providers
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

create policy tracking_providers_admin_delete on public.tracking_providers
  for delete using ((select public.is_admin()));
