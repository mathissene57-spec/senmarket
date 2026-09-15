-- ============================================================================
-- SENLINK — Migration 5 : Foundation Core V1 (Countries + Corridors + Tenant
-- Anchoring)
-- ============================================================================
-- STATUT : DRAFT. NON APPLIQUÉ. Rédigé à la suite de Foundation Core Discovery
-- Report V1 (7 sept. 2026) et Foundation Core Specification V1.1
-- (senlink/docs/foundation-core-specification-v1.md), tous deux relus et
-- arbitrés par revue humaine. Toute référence "§X" ci-dessous renvoie aux
-- sections de ce document.
--
-- Contexte : SenLink vise à devenir un "African Logistics Core" multi-pays,
-- multi-corridors, multi-tenant. Le schéma réel (Migrations 1-4) code en dur
-- le corridor Maroc<->Sénégal via 4 CHECK constraints ('MA','SN') et n'a
-- aucune notion de corridor explicite ni de rattachement organisationnel
-- direct sur shipments/shipment_lots (l'appartenance à un tenant est
-- aujourd'hui seulement dérivable indirectement via transporter/hub/pickup
-- point). Cette migration introduit deux référentiels (countries, corridors)
-- et un rattachement tenant (organization_id) SANS modifier aucune policy,
-- fonction ou trigger des Migrations 1 à 4 — chaque mécanisme est une
-- ADDITION pure (nouvelles tables, nouvelles colonnes nullables, nouveaux
-- triggers), jamais une modification d'un objet existant. Ce choix a été
-- vérifié possible en lisant le corps réel des fonctions concernées : toutes
-- les écritures sur shipments.lot_id / shipments.status / shipment_lots
-- passent par de simples UPDATE/INSERT génériques qu'un trigger intercepte
-- sans toucher la fonction elle-même (voir Specification §4.1, §4.3, §6).
--
-- Tenant Isolation (resserrement des policies *_public_read) est
-- explicitement HORS PÉRIMÈTRE de cette migration — ce sera, si décidé plus
-- tard, une Migration 6 séparée après audit des consommateurs réels.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PREFLIGHT — abort si l'état réel a dérivé depuis l'audit du 7 sept. 2026.
--    Même discipline que Migration 4 : comparaisons par LIKE sur des
--    fragments significatifs plutôt que des égalités exactes de texte de
--    contrainte (leçon apprise sur un faux-positif de formatage de
--    parenthèses lors de Migration 4).
-- ----------------------------------------------------------------------------
do $preflight$
declare
  v_def text;
begin
  -- 0.1 Les nouvelles tables ne doivent pas déjà exister.
  if to_regclass('public.countries') is not null then
    raise exception 'PREFLIGHT FAILED: public.countries existe déjà';
  end if;
  if to_regclass('public.corridors') is not null then
    raise exception 'PREFLIGHT FAILED: public.corridors existe déjà';
  end if;

  -- 0.2 Les nouvelles colonnes ne doivent pas déjà exister.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'organization_id'
  ) then
    raise exception 'PREFLIGHT FAILED: shipments.organization_id existe déjà';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipment_lots' and column_name = 'organization_id'
  ) then
    raise exception 'PREFLIGHT FAILED: shipment_lots.organization_id existe déjà';
  end if;

  -- 0.3 Les 4 CHECK constraints pays doivent être exactement celles auditées.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.organizations'::regclass and conname = 'organizations_country_check';
  if v_def is null or v_def not like '%country = ANY%MA%SN%' then
    raise exception 'PREFLIGHT FAILED: organizations_country_check absente ou différente de celle auditée';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.hubs'::regclass and conname = 'hubs_country_check';
  if v_def is null or v_def not like '%country = ANY%MA%SN%' then
    raise exception 'PREFLIGHT FAILED: hubs_country_check absente ou différente de celle auditée';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.pickup_points'::regclass and conname = 'pickup_points_country_check';
  if v_def is null or v_def not like '%country = ANY%MA%SN%' then
    raise exception 'PREFLIGHT FAILED: pickup_points_country_check absente ou différente de celle auditée';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.shipments'::regclass and conname = 'shipments_origin_country_check';
  if v_def is null or v_def not like '%origin_country = ANY%MA%SN%' then
    raise exception 'PREFLIGHT FAILED: shipments_origin_country_check absente ou différente de celle auditée';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.shipments'::regclass and conname = 'shipments_destination_country_check';
  if v_def is null or v_def not like '%destination_country = ANY%MA%SN%' then
    raise exception 'PREFLIGHT FAILED: shipments_destination_country_check absente ou différente de celle auditée';
  end if;

  -- 0.4 shipments.currency doit toujours être NOT NULL DEFAULT 'MAD' (sinon la
  --     Variante 2 du fallback devise s'appliquerait sur une base qui a déjà changé).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'currency'
      and is_nullable = 'NO' and column_default = '''MAD''::text'
  ) then
    raise exception 'PREFLIGHT FAILED: shipments.currency n''est plus NOT NULL DEFAULT ''MAD'' — état différent de celui audité';
  end if;

  -- 0.5 Les fonctions dont le corps a été lu et cité dans la Specification
  --     doivent avoir exactement les mêmes signatures.
  if to_regprocedure('public.record_shipment_event(uuid, text, text, text, numeric, numeric, text, text, text, jsonb, jsonb)') is null then
    raise exception 'PREFLIGHT FAILED: record_shipment_event() a une signature différente de celle auditée';
  end if;
  if to_regprocedure('public.create_shipment_lot(uuid, uuid, uuid, text)') is null then
    raise exception 'PREFLIGHT FAILED: create_shipment_lot() a une signature différente de celle auditée';
  end if;
  if to_regprocedure('public.add_shipment_to_lot(uuid, uuid, text)') is null then
    raise exception 'PREFLIGHT FAILED: add_shipment_to_lot() a une signature différente de celle auditée';
  end if;
  if to_regprocedure('public.reassign_shipment_lot(uuid, uuid, text)') is null then
    raise exception 'PREFLIGHT FAILED: reassign_shipment_lot() a une signature différente de celle auditée';
  end if;
  if to_regprocedure('public.can_access_shipment(uuid)') is null then
    raise exception 'PREFLIGHT FAILED: can_access_shipment() a une signature différente de celle auditée';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'PREFLIGHT FAILED: is_admin() a une signature différente de celle auditée';
  end if;

  -- 0.6 Les 5 triggers existants sur shipments/shipment_lots doivent être
  --     exactement ceux inventoriés dans la Specification §11.
  if not exists (select 1 from pg_trigger where tgname = 'trg_shipments_tracking_code' and tgrelid = 'public.shipments'::regclass) then
    raise exception 'PREFLIGHT FAILED: trg_shipments_tracking_code absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_prevent_direct_status_change' and tgrelid = 'public.shipments'::regclass) then
    raise exception 'PREFLIGHT FAILED: trg_prevent_direct_status_change absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_shipments_updated_at' and tgrelid = 'public.shipments'::regclass) then
    raise exception 'PREFLIGHT FAILED: trg_shipments_updated_at absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_shipment_lots_lot_code' and tgrelid = 'public.shipment_lots'::regclass) then
    raise exception 'PREFLIGHT FAILED: trg_shipment_lots_lot_code absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_prevent_direct_lot_status_change' and tgrelid = 'public.shipment_lots'::regclass) then
    raise exception 'PREFLIGHT FAILED: trg_prevent_direct_lot_status_change absent';
  end if;

  -- 0.7 Aucun des nouveaux triggers/fonctions ne doit déjà exister (collision de nom).
  if to_regprocedure('public.is_corridor_active(text, text)') is not null then
    raise exception 'PREFLIGHT FAILED: is_corridor_active() existe déjà';
  end if;
  if to_regprocedure('public.derive_shipment_organization()') is not null then
    raise exception 'PREFLIGHT FAILED: derive_shipment_organization() existe déjà';
  end if;
end $preflight$;

-- ----------------------------------------------------------------------------
-- 1. RÉFÉRENTIEL countries (Specification §2)
-- ----------------------------------------------------------------------------
create table public.countries (
  code             text primary key,
  name             text not null,
  default_currency text not null,
  active           boolean not null default true
);

comment on table public.countries is
  'Référentiel des pays exploitables par le Core. Remplace les CHECK (''MA'',''SN'') '
  'précédemment codés en dur sur organizations/hubs/pickup_points/shipments. '
  'active est une gate applicative (comme hubs.active), pas une contrainte référentielle.';

alter table public.countries enable row level security;

create policy countries_public_read on public.countries
  for select
  using (true);

create policy countries_admin_write on public.countries
  for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.countries from public, anon, authenticated;
grant select on public.countries to anon, authenticated;

insert into public.countries (code, name, default_currency, active) values
  ('MA', 'Maroc', 'MAD', true),
  ('SN', 'Sénégal', 'XOF', true);

-- ----------------------------------------------------------------------------
-- 2. RÉFÉRENTIEL corridors (Specification §2, §6)
-- ----------------------------------------------------------------------------
create table public.corridors (
  id                   uuid primary key default gen_random_uuid(),
  origin_country       text not null references public.countries(code),
  destination_country  text not null references public.countries(code),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint corridors_no_domestic check (origin_country <> destination_country),
  constraint corridors_unique_pair unique (origin_country, destination_country)
);

comment on table public.corridors is
  'Entité métier distincte d''un pays : un pays autorisé (countries.active) ne rend '
  'pas automatiquement tous ses corridors disponibles. Directionnel : MA->SN et SN->MA '
  'sont deux lignes indépendantes. Pas de corridor domestique en V1 (CHECK explicite).';

alter table public.corridors enable row level security;

create policy corridors_public_read on public.corridors
  for select
  using (true);

create policy corridors_admin_write on public.corridors
  for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.corridors from public, anon, authenticated;
grant select on public.corridors to anon, authenticated;

insert into public.corridors (origin_country, destination_country, active) values
  ('MA', 'SN', true),
  ('SN', 'MA', true);

create or replace function public.is_corridor_active(p_origin text, p_destination text)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1 from public.corridors
    where origin_country = p_origin
      and destination_country = p_destination
      and active = true
  );
$function$;

revoke execute on function public.is_corridor_active(text, text) from public, anon;
grant execute on function public.is_corridor_active(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. MIGRATION DES 4 CHECK CONSTRAINTS VERS DES FK (Specification §3, §5)
--    Neutre pour les données existantes : la base est vide, et les seules
--    valeurs jamais possibles ('MA','SN') sont désormais dans countries.
-- ----------------------------------------------------------------------------
alter table public.organizations drop constraint organizations_country_check;
alter table public.organizations add constraint organizations_country_fkey
  foreign key (country) references public.countries(code);

alter table public.hubs drop constraint hubs_country_check;
alter table public.hubs add constraint hubs_country_fkey
  foreign key (country) references public.countries(code);

alter table public.pickup_points drop constraint pickup_points_country_check;
alter table public.pickup_points add constraint pickup_points_country_fkey
  foreign key (country) references public.countries(code);

alter table public.shipments drop constraint shipments_origin_country_check;
alter table public.shipments add constraint shipments_origin_country_fkey
  foreign key (origin_country) references public.countries(code);

alter table public.shipments drop constraint shipments_destination_country_check;
alter table public.shipments add constraint shipments_destination_country_fkey
  foreign key (destination_country) references public.countries(code);

-- ----------------------------------------------------------------------------
-- 4. TENANT ANCHORING — nouvelles colonnes (Specification §4)
--    Nullable, jamais accordées en lecture/écriture à anon/authenticated par
--    défaut (voir §14 de la Specification : comportement sûr par défaut,
--    aucune exposition tant qu'une décision explicite n'est prise).
-- ----------------------------------------------------------------------------
alter table public.shipments
  add column organization_id uuid references public.organizations(id);

comment on column public.shipments.organization_id is
  'Organisation ACTUELLEMENT responsable du traitement opérationnel du colis '
  '(pas un historique, pas nécessairement le transporteur physique). Dérivée '
  'automatiquement par trigger selon le statut (voir derive_shipment_organization()) ; '
  'jamais renseignable directement par un client (aucun GRANT sur cette colonne).';

alter table public.shipment_lots
  add column organization_id uuid references public.organizations(id);

comment on column public.shipment_lots.organization_id is
  'Organisation du transporteur du lot, dérivée une seule fois à la création '
  '(un lot ne change jamais de transporteur après création — voir '
  'Specification §4.4).';

-- ----------------------------------------------------------------------------
-- 5. FALLBACK DEVISE (Specification §8, Variante 2)
--    Retire le défaut littéral 'MAD' ; un trigger le remplace par une valeur
--    dérivée de countries.default_currency UNIQUEMENT si l'appelant n'a rien
--    fourni — préserve exactement le comportement observable actuel de
--    app/envois/nouveau/page.tsx (qui n'envoie jamais 'currency') sans
--    nécessiter de changement Next.js.
-- ----------------------------------------------------------------------------
alter table public.shipments alter column currency drop default;

create or replace function public.fallback_shipment_currency()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.currency is null then
    select default_currency into new.currency
    from public.countries
    where code = new.origin_country;
  end if;
  return new;
end;
$function$;

create trigger trg_shipments_fallback_currency
  before insert on public.shipments
  for each row execute function public.fallback_shipment_currency();

-- ----------------------------------------------------------------------------
-- 6. VALIDATION CORRIDOR (Specification §6)
--    Un pays autorisé n'implique pas un corridor autorisé. Deux points de
--    contrôle : à la création du shipment, et à chaque affectation/
--    réaffectation à un lot (add_shipment_to_lot / reassign_shipment_lot
--    modifient lot_id par un simple UPDATE générique — voir Specification
--    §4.1/§6 — donc ce trigger les intercepte sans les modifier).
-- ----------------------------------------------------------------------------
create or replace function public.validate_shipment_corridor_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not public.is_corridor_active(new.origin_country, new.destination_country) then
    raise exception 'corridor % -> % inexistant ou inactif', new.origin_country, new.destination_country;
  end if;
  return new;
end;
$function$;

create trigger trg_shipments_validate_corridor_insert
  before insert on public.shipments
  for each row execute function public.validate_shipment_corridor_insert();

create or replace function public.validate_shipment_corridor_lot()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.lot_id is not null and not public.is_corridor_active(new.origin_country, new.destination_country) then
    raise exception 'corridor % -> % inexistant ou inactif', new.origin_country, new.destination_country;
  end if;
  return new;
end;
$function$;

create trigger trg_shipments_validate_corridor_lot
  before update of lot_id on public.shipments
  for each row execute function public.validate_shipment_corridor_lot();

-- ----------------------------------------------------------------------------
-- 7. DÉRIVATION DU TENANT — shipment_lots (Specification §4.3)
--    Une seule fois, à la création, depuis le transporteur déjà résolu par
--    create_shipment_lot() (non modifiée — simple INSERT générique intercepté).
-- ----------------------------------------------------------------------------
create or replace function public.derive_lot_organization()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.organization_id is null and new.transporter_id is not null then
    select organization_id into new.organization_id
    from public.transporters
    where id = new.transporter_id;
  end if;
  return new;
end;
$function$;

create trigger trg_shipment_lots_derive_organization
  before insert on public.shipment_lots
  for each row execute function public.derive_lot_organization();

-- ----------------------------------------------------------------------------
-- 8. DÉRIVATION DU TENANT — shipments, à la création (Specification §4.5)
-- ----------------------------------------------------------------------------
create or replace function public.derive_shipment_organization_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_org uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;

  if new.created_by is not null then
    select organization_id into v_org
    from public.user_roles
    where user_id = new.created_by and organization_id is not null
    limit 1;
    new.organization_id := v_org;
  end if;

  return new;
end;
$function$;

create trigger trg_shipments_derive_organization_insert
  before insert on public.shipments
  for each row execute function public.derive_shipment_organization_on_insert();

-- ----------------------------------------------------------------------------
-- 9. DÉRIVATION DU TENANT — shipments, sur changement de statut
--    (Specification §4.2, §4.3 — mapping tranché par revue humaine)
--    Scopé sur "UPDATE OF status" : une modification de poids, dimensions,
--    valeur déclarée, métadonnées ou QR ne déclenche jamais ce trigger, par
--    construction (ces colonnes ne font jamais partie du SET de ce trigger).
-- ----------------------------------------------------------------------------
create or replace function public.derive_shipment_organization()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_org uuid;
begin
  if new.status = 'cancelled' then
    -- Conserve la dernière organisation responsable, aucun recalcul.
    return new;
  end if;

  if new.status in ('dropped_off', 'inspected', 'at_pickup_point', 'out_for_delivery', 'delivered') then
    if new.current_pickup_point_id is not null then
      select organization_id into v_org from public.pickup_points where id = new.current_pickup_point_id;
      new.organization_id := v_org;
    end if;

  elsif new.status in ('departed_origin', 'in_transit_international', 'customs_clearance') then
    if new.assigned_transporter_id is not null then
      select organization_id into v_org from public.transporters where id = new.assigned_transporter_id;
      new.organization_id := v_org;
    end if;

  elsif new.status = 'arrived_destination' then
    -- current_hub_id n'est renseigné qu'à 'at_hub' (un statut plus tard) :
    -- dérivation via le hub de destination du lot plutôt que current_hub_id.
    -- Décision explicite (revue humaine) : M1 (record_shipment_event)
    -- n'exige jamais lot_id pour aucun statut, y compris arrived_destination
    -- -- Foundation V1 ne doit pas introduire silencieusement une nouvelle
    -- obligation métier ("un colis doit être en lot pour arriver"). Si
    -- lot_id est null, on ne bloque PAS la transition de statut et on ne
    -- modifie PAS organization_id (conserve la dernière valeur connue). La
    -- question produit "un colis peut-il atteindre arrived_destination sans
    -- lot ?" reste ouverte pour un futur chantier séparé, pas tranchée ici.
    if new.lot_id is not null then
      select h.organization_id into v_org
      from public.shipment_lots sl
      join public.hubs h on h.id = sl.destination_hub_id
      where sl.id = new.lot_id;
      if v_org is not null then
        new.organization_id := v_org;
      end if;
    end if;

  elsif new.status = 'at_hub' then
    if new.current_hub_id is not null then
      select organization_id into v_org from public.hubs where id = new.current_hub_id;
      new.organization_id := v_org;
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_shipments_derive_organization
  before update of status on public.shipments
  for each row execute function public.derive_shipment_organization();

-- ============================================================================
-- ORDRE DES TRIGGERS — vérification de compatibilité (Specification §11)
-- ============================================================================
-- Triggers BEFORE INSERT sur shipments après cette migration (ordre
-- alphabétique réel, Postgres exécute dans cet ordre) :
--   trg_shipments_derive_organization_insert
--   trg_shipments_fallback_currency
--   trg_shipments_tracking_code                 (existant, Migration 1, intact)
--   trg_shipments_validate_corridor_insert
--
-- Triggers BEFORE UPDATE sur shipments après cette migration :
--   trg_prevent_direct_status_change            (existant, Migration Security
--                                                 Hardening, intact)
--   trg_shipments_derive_organization            (scopé "OF status")
--   trg_shipments_updated_at                    (existant, Migration 1, intact)
--   trg_shipments_validate_corridor_lot          (scopé "OF lot_id")
--
-- Aucune dépendance d'ordre réelle : les nouveaux triggers ne lisent que des
-- colonnes qu'aucun trigger existant ne modifie (assigned_transporter_id,
-- current_hub_id, current_pickup_point_id, origin_country, destination_country,
-- lot_id, created_by) et n'écrivent que dans des colonnes qu'aucun trigger
-- existant ne touche (organization_id, currency). Si trg_prevent_direct_
-- status_change ou trg_prevent_direct_lot_status_change lève une exception,
-- la transaction entière est annulée quel que soit l'ordre d'exécution
-- relatif — les effets des nouveaux triggers sont annulés avec elle.
--
-- Compatibilité avec can_access_shipment() (Specification §13) : cette
-- fonction (Migration 4) ne référence ni organization_id, ni countries, ni
-- corridors — aucune interaction possible, confirmé par relecture de son
-- corps réel (client_user_id, is_admin(), pickup_point_id, transporter_id
-- uniquement).
-- ============================================================================

-- ============================================================================
-- ROLLBACK EXACT (à exécuter dans cet ordre si un retour arrière est décidé —
-- non exécuté par cette migration elle-même)
-- ============================================================================
-- drop trigger if exists trg_shipments_derive_organization on public.shipments;
-- drop function if exists public.derive_shipment_organization();
-- drop trigger if exists trg_shipments_derive_organization_insert on public.shipments;
-- drop function if exists public.derive_shipment_organization_on_insert();
-- drop trigger if exists trg_shipment_lots_derive_organization on public.shipment_lots;
-- drop function if exists public.derive_lot_organization();
-- drop trigger if exists trg_shipments_validate_corridor_lot on public.shipments;
-- drop function if exists public.validate_shipment_corridor_lot();
-- drop trigger if exists trg_shipments_validate_corridor_insert on public.shipments;
-- drop function if exists public.validate_shipment_corridor_insert();
-- drop trigger if exists trg_shipments_fallback_currency on public.shipments;
-- drop function if exists public.fallback_shipment_currency();
-- alter table public.shipments alter column currency set default 'MAD';
-- alter table public.shipment_lots drop column if exists organization_id;
-- alter table public.shipments drop column if exists organization_id;
-- alter table public.shipments drop constraint if exists shipments_destination_country_fkey;
-- alter table public.shipments add constraint shipments_destination_country_check
--   check (destination_country = any (array['MA','SN']));
-- alter table public.shipments drop constraint if exists shipments_origin_country_fkey;
-- alter table public.shipments add constraint shipments_origin_country_check
--   check (origin_country = any (array['MA','SN']));
-- alter table public.pickup_points drop constraint if exists pickup_points_country_fkey;
-- alter table public.pickup_points add constraint pickup_points_country_check
--   check (country = any (array['MA','SN']));
-- alter table public.hubs drop constraint if exists hubs_country_fkey;
-- alter table public.hubs add constraint hubs_country_check
--   check (country = any (array['MA','SN']));
-- alter table public.organizations drop constraint if exists organizations_country_fkey;
-- alter table public.organizations add constraint organizations_country_check
--   check (country = any (array['MA','SN']));
-- drop function if exists public.is_corridor_active(text, text);
-- drop table if exists public.corridors;
-- drop table if exists public.countries;
-- ============================================================================

-- ============================================================================
-- PLAN DE TESTS (à exécuter APRÈS un GO explicite d'application, jamais avant
-- — ce fichier, à ce stade, n'est qu'un brouillon relu, pas encore appliqué)
-- ============================================================================
-- 1. Preflight : réexécuter le bloc do $preflight$ seul dans une transaction
--    rollback juste avant l'application réelle, pour confirmer qu'aucune
--    dérive n'a eu lieu entre la rédaction et l'application.
-- 2. Non-régression Migrations 1-4 (en transaction rollback, comme lors de
--    l'audit du 7 sept.) :
--    - anon toujours 42501 sur incidents, shipments, shipment_events.
--    - can_access_shipment() toujours inexécutable par anon, toujours
--      fonctionnel pour authenticated.
--    - record_shipment_event(), create_shipment_lot(), add_shipment_to_lot(),
--      reassign_shipment_lot() toujours exécutables avec les mêmes
--      signatures et le même comportement observable (créer un scénario de
--      test complet : création shipment -> lot -> departed_origin -> ... ->
--      delivered, vérifier que chaque étape réussit comme avant cette
--      migration).
-- 3. Nouveaux mécanismes (à tester avec de vrais comptes de test, pas des
--    UUID synthétiques — contrairement à l'audit RLS, ici le comportement
--    procédural des triggers doit être vérifié avec des données réelles) :
--    - Création d'un shipment MA->SN : doit réussir (corridor actif),
--      organization_id = NULL si créé par un client self-service.
--    - Création d'un shipment MA->CI (CI absent de countries) : doit échouer
--      au niveau FK (countries.code) avant même le trigger de corridor.
--    - Désactiver le corridor MA->SN (UPDATE corridors SET active=false),
--      retenter une création MA->SN : doit échouer avec le message du
--      trigger validate_shipment_corridor_insert().
--    - Faire progresser un shipment dropped_off -> ... -> delivered avec un
--      lot réel : vérifier organization_id à CHAQUE statut contre le mapping
--      du §4.2 de la Specification (en particulier arrived_destination :
--      vérifier qu'il prend bien l'organisation du hub de destination du
--      lot, pas une valeur null ni celle du transporteur).
--    - Faire passer un shipment JAMAIS rattaché à un lot (lot_id IS NULL) à
--      'arrived_destination' : la transition de statut DOIT réussir (M1
--      n'exige pas lot_id pour ce statut, Foundation V1 ne doit pas
--      introduire cette obligation silencieusement -- décision explicite de
--      la revue humaine) ; organization_id doit rester inchangé (pas de
--      downgrade vers null, pas d'erreur).
--    - Modifier weight_real_kg ou declared_value sur un shipment déjà
--      affecté : vérifier qu'organization_id NE CHANGE PAS (déclaration
--      explicite du point 2 de la revue humaine).
--    - Créer un lot avec create_shipment_lot() : vérifier
--      shipment_lots.organization_id = transporters.organization_id du
--      transporter résolu.
--    - Annuler un shipment (cancelled) depuis n'importe quel statut :
--      vérifier organization_id inchangé après l'annulation.
-- 4. Vérifier qu'aucun rôle (anon, authenticated) ne peut lire
--    shipments.organization_id / shipment_lots.organization_id sans un
--    GRANT explicite ajouté séparément (comportement attendu : erreur ou
--    colonne absente du résultat, jamais une valeur).
-- 5. get_advisors (security + performance) après application : vérifier
--    qu'aucun nouveau WARN de sécurité n'apparaît (un nouveau lint
--    performance sur des index manquants sur countries/corridors serait
--    attendu et non bloquant, cohérent avec performance-backlog.md).
-- ============================================================================
