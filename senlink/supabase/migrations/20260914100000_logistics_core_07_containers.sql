do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='containers') then
    raise exception 'PREFLIGHT FAILED: containers existe déjà';
  end if;
end;
$preflight$;

-- GO MIGRATION — Logistics Core, étape 7/12 (containers + can_access_container).
-- Regroupe ce qui était noté "étape 4" (can_access_container) et "étape 8"
-- (containers) dans le plan Phase 1.1 : la fonction interroge containers,
-- donc elle ne peut être créée qu'après la table — correction de
-- séquencement pure, aucun changement de conception.
--
-- Validation ISO 6346 implémentée en toutes lettres (algorithme officiel :
-- 26 lettres -> valeurs 10..38 en sautant les multiples de 11, poids 2^i
-- sur les 10 premiers caractères, clé = (somme mod 11) mod 10) plutôt
-- qu'un simple flag booléen déclaratif — vérifiée sur le cas canonique
-- Wikipedia CSQU3054383 (valide) avant application.
create or replace function public.iso6346_check_digit(p_container_number text)
returns int
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_letter_values int[] := array[10,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38];
  v_char char(1);
  v_value int;
  v_sum bigint := 0;
  v_pos int;
begin
  if p_container_number is null or length(p_container_number) < 10 then
    return null;
  end if;
  for v_pos in 1..10 loop
    v_char := upper(substr(p_container_number, v_pos, 1));
    if v_char ~ '^[A-Z]$' then
      v_value := v_letter_values[ascii(v_char) - ascii('A') + 1];
    elsif v_char ~ '^[0-9]$' then
      v_value := v_char::int;
    else
      return null;
    end if;
    v_sum := v_sum + v_value * (2 ^ (v_pos - 1))::bigint;
  end loop;
  return (v_sum % 11) % 10;
end;
$function$;

create or replace function public.is_valid_iso6346(p_container_number text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_container_number ~ '^[A-Z]{4}[0-9]{7}$'
    and public.iso6346_check_digit(p_container_number) = substr(p_container_number, 11, 1)::int;
$function$;

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  container_number text not null,
  container_type text,
  carrier_prefix text references public.carrier_prefixes(prefix),
  vessel_name text,
  voyage_number text,
  origin_port_id text references public.ports(code),
  destination_port_id text references public.ports(code),
  current_status text not null default 'booked' check (current_status = any (array[
    'booked','gate_in','loaded','vessel_departed','in_transit','transshipment',
    'vessel_arrived','discharged','available','unloading','empty_returned'
  ])),
  eta timestamptz,
  ata timestamptz,
  tracking_provider_id uuid references public.tracking_providers(id),
  external_ref text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint containers_organization_id_container_number_key unique (organization_id, container_number)
);

-- Normalise en majuscule (comportement, pas juste une contrainte) et
-- valide le format à l'écriture — cohérent avec generate_shipment_tracking_code
-- qui normalise déjà côté colis.
create or replace function public.normalize_container_number()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.container_number := upper(trim(new.container_number));
  if not public.is_valid_iso6346(new.container_number) then
    raise exception 'numéro de conteneur invalide (format ISO 6346 attendu) : %', new.container_number;
  end if;
  return new;
end;
$function$;

create trigger trg_normalize_container_number
  before insert or update of container_number on public.containers
  for each row execute function public.normalize_container_number();

-- Réutilise set_updated_at(), déjà en place pour d'autres tables.
create trigger trg_containers_updated_at
  before update on public.containers
  for each row execute function public.set_updated_at();

create index idx_containers_organization_id on public.containers(organization_id);
create index idx_containers_current_status on public.containers(current_status);
create index idx_containers_tracking_provider_id on public.containers(tracking_provider_id);

alter table public.containers enable row level security;

-- Prédicat miroir de can_access_shipment (même style : SQL STABLE,
-- auth.uid()/is_admin() non enveloppés, comme la fonction qu'il imite).
create or replace function public.can_access_container(p_container_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1 from public.containers c
    where c.id = p_container_id
      and (
        public.is_admin()
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.organization_id = c.organization_id
        )
      )
  );
$function$;

-- Lecture : tout membre de l'organisation (y compris org_viewer) ou admin.
create policy containers_org_select on public.containers
  for select using (
    (select public.is_admin())
    or organization_id in (
      select ur.organization_id from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.organization_id is not null
    )
  );

-- Écriture : admin uniquement à ce stade (infrastructure only — aucune
-- vertical/UI construite, donc aucune règle "quel rôle organisationnel
-- peut créer un container" n'est encore tranchée). org_viewer n'obtient
-- aucune policy d'écriture, ici ou ailleurs dans cette migration.
create policy containers_admin_insert on public.containers
  for insert with check ((select public.is_admin()));
create policy containers_admin_update on public.containers
  for update using ((select public.is_admin())) with check ((select public.is_admin()));
create policy containers_admin_delete on public.containers
  for delete using ((select public.is_admin()));
