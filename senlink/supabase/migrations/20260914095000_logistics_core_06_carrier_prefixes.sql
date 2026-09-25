do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='carrier_prefixes') then
    raise exception 'PREFLIGHT FAILED: carrier_prefixes existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 6/12 (carrier_prefixes).
-- Table de correspondance préfixe ISO 6346 -> armateur, corrigible (le
-- préfixe n'est jamais une vérité absolue sur le transporteur opérationnel
-- réel, §9 du brief). AUCUN SEED : ni le registre BIC officiel (payant/
-- licencié) ni une liste de commodité ne sont injectés à cette étape —
-- la table se peuplera plus tard via un import confirmé ou en cache
-- alimenté par les réponses d'un vrai tracking_provider.
create table public.carrier_prefixes (
  prefix text primary key check (prefix ~ '^[A-Z]{4}$'),
  shipping_line_name text not null,
  shipping_line_scac text,
  source text not null default 'manual' check (source = any (array['iso_registry','manual'])),
  updated_at timestamptz not null default now()
);

alter table public.carrier_prefixes enable row level security;

create policy carrier_prefixes_public_read on public.carrier_prefixes
  for select using (true);

create policy carrier_prefixes_admin_insert on public.carrier_prefixes
  for insert with check ((select public.is_admin()));

create policy carrier_prefixes_admin_update on public.carrier_prefixes
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

create policy carrier_prefixes_admin_delete on public.carrier_prefixes
  for delete using ((select public.is_admin()));
