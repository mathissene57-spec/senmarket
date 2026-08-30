-- SENLINK — schéma initial (chantier 4 du document de référence)
-- Brouillon de scaffold, PORTABLE mais NON APPLIQUÉ automatiquement.
-- À appliquer plus tard sur un projet Supabase dédié et vide, une fois ce
-- projet réellement provisionné (voir senlink/README.md).
--
-- Contrairement au précédent "phase3a_foundation.sql" du repo SenMarket
-- (docs/rollback/phase3a_foundation_down.sql), qui était mort parce qu'il
-- entrait en collision avec un schéma de production déjà existant, ce
-- fichier n'a pas ce risque : SENLINK est un produit séparé qui utilisera
-- un projet Supabase entièrement neuf.
--
-- Modélisation basée sur la section 8 du document SENLINK ("modèle de
-- données initial"), la timeline de la section 3, et la règle de preuve
-- obligatoire de la section 16. Volontairement minimal, conformément à
-- l'avertissement de la section 8 : "Ne pas créer inutilement une
-- architecture gigantesque avant validation terrain."

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Trigger générique updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- organizations — entité chapeau derrière transporteurs, hubs, points relais
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('transporteur', 'point_relais_operator', 'hub_operator', 'platform')),
  name text not null,
  country text check (country in ('MA', 'SN')),
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — extension 1:1 de auth.users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  whatsapp_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- user_roles — un utilisateur peut cumuler plusieurs rôles
-- (ex: un admin qui est aussi client)
-- ---------------------------------------------------------------------------
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('client', 'agent_point_relais', 'transporteur', 'admin')),
  organization_id uuid references organizations (id) on delete set null,
  pickup_point_id uuid, -- fk ajoutée plus bas une fois pickup_points créée
  hub_id uuid,          -- fk ajoutée plus bas une fois hubs créée
  created_at timestamptz not null default now(),
  unique (user_id, role, organization_id)
);

-- ---------------------------------------------------------------------------
-- hubs
-- ---------------------------------------------------------------------------
create table hubs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete set null,
  name text not null,
  city text not null,
  country text not null check (country in ('MA', 'SN')),
  address text,
  lat numeric,
  lng numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pickup_points (points relais)
-- ---------------------------------------------------------------------------
create table pickup_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete set null,
  hub_id uuid references hubs (id) on delete set null,
  name text not null,
  city text not null,
  country text not null check (country in ('MA', 'SN')),
  address text,
  phone text,
  lat numeric,
  lng numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table user_roles
  add constraint user_roles_pickup_point_id_fkey
    foreign key (pickup_point_id) references pickup_points (id) on delete set null,
  add constraint user_roles_hub_id_fkey
    foreign key (hub_id) references hubs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- transporters (transporteurs)
-- ---------------------------------------------------------------------------
create table transporters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete set null,
  name text not null,
  country_scope text[],
  trust_score numeric,  -- Trust Score (section 5) : vision long terme, non calculé par ce scaffold
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- shipment_lots (lots / manifestes — section 2 "regroupé dans un lot")
-- ---------------------------------------------------------------------------
create table shipment_lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text not null unique,
  transporter_id uuid references transporters (id) on delete set null,
  origin_hub_id uuid references hubs (id) on delete set null,
  destination_hub_id uuid references hubs (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_transit', 'arrived', 'closed')),
  departed_at timestamptz,
  arrived_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- shipments (colis)
-- ---------------------------------------------------------------------------
create table shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,

  client_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,

  sender_name text not null,
  sender_phone text not null,
  sender_address text,
  origin_city text not null,
  origin_country text not null default 'MA' check (origin_country in ('MA', 'SN')),

  recipient_name text not null,
  recipient_phone text not null,
  recipient_address text,
  destination_city text not null,
  destination_country text not null default 'SN' check (destination_country in ('MA', 'SN')),

  category text,
  weight_declared_kg numeric,
  weight_real_kg numeric,
  dimensions_cm jsonb, -- {"l":..,"w":..,"h":..}
  declared_value numeric,
  currency text not null default 'MAD',
  photo_url text, -- photo prise à la création

  status text not null default 'created' check (status in (
    'created', 'dropped_off', 'inspected', 'departed_origin',
    'in_transit_international', 'customs_clearance', 'arrived_destination',
    'at_hub', 'at_pickup_point', 'out_for_delivery', 'delivered',
    'incident', 'cancelled'
  )),

  current_hub_id uuid references hubs (id) on delete set null,
  current_pickup_point_id uuid references pickup_points (id) on delete set null,
  assigned_transporter_id uuid references transporters (id) on delete set null,
  lot_id uuid references shipment_lots (id) on delete set null,

  qr_code_data text, -- payload encodé dans le QR ; par défaut = tracking_code
  delivery_otp text,  -- section 2 : "retrait avec QR Code ou OTP"
  delivered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipments_client_user_id on shipments (client_user_id);
create index idx_shipments_status on shipments (status);
create index idx_shipments_current_pickup_point_id on shipments (current_pickup_point_id);
create index idx_shipments_assigned_transporter_id on shipments (assigned_transporter_id);

create trigger trg_shipments_updated_at
  before update on shipments
  for each row execute function set_updated_at();

-- Génère automatiquement tracking_code + qr_code_data si absents à l'insertion
create or replace function generate_shipment_tracking_code()
returns trigger
language plpgsql
as $$
declare
  v_suffix text;
begin
  if new.tracking_code is null or length(trim(new.tracking_code)) = 0 then
    v_suffix := lpad((floor(random() * 999999))::int::text, 6, '0');
    new.tracking_code := 'SL-' || new.origin_country || '-' || new.destination_country || '-' || v_suffix;
  end if;
  if new.qr_code_data is null then
    new.qr_code_data := new.tracking_code;
  end if;
  return new;
end;
$$;

create trigger trg_shipments_tracking_code
  before insert on shipments
  for each row execute function generate_shipment_tracking_code();

-- ---------------------------------------------------------------------------
-- shipment_events — journal de preuve/audit, append-only (sections 3 et 16)
-- ---------------------------------------------------------------------------
create table shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  event_type text not null,
  new_status text, -- statut atteint via cet événement, le cas échéant

  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text,

  location_text text,
  location_lat numeric,
  location_lng numeric,
  device_info jsonb not null default '{}'::jsonb,

  photo_url text,
  qr_scan_ref text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_shipment_events_shipment_id on shipment_events (shipment_id, created_at);

-- Pas de colonne updated_at et aucune politique UPDATE/DELETE plus bas :
-- cette table est append-only par conception (section 3 : "Audit log
-- robuste natif").

-- ---------------------------------------------------------------------------
-- Garde-fou : shipments.status ne peut changer que via record_shipment_event()
-- (section 16 : "Aucun statut ne doit exister uniquement parce qu'un
-- opérateur l'a sélectionné — il faut une preuve, pas un simple bouton.")
-- ---------------------------------------------------------------------------
create or replace function prevent_direct_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.via_record_event', true), '') <> 'true' then
    raise exception 'shipments.status can only be changed via record_shipment_event()';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_direct_status_change
  before update on shipments
  for each row execute function prevent_direct_status_change();

-- Statuts devant être appuyés d'une photo ou d'un scan QR avant d'être
-- appliqués. Premier brouillon — à revoir une fois le chantier 1/2 validé
-- sur le terrain (quelles étapes ont vraiment besoin d'une preuve
-- photographique vs. un simple scan suffisant).
create or replace function record_shipment_event(
  p_shipment_id uuid,
  p_event_type text,
  p_new_status text default null,
  p_location_text text default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_device_info jsonb default '{}'::jsonb,
  p_photo_url text default null,
  p_qr_scan_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_event_id uuid;
  v_requires_proof boolean;
begin
  select role into v_role
  from public.user_roles
  where user_id = v_actor
  order by created_at
  limit 1;

  v_requires_proof := p_new_status in (
    'dropped_off', 'inspected', 'arrived_destination', 'at_pickup_point', 'delivered'
  );

  if v_requires_proof and p_photo_url is null and p_qr_scan_ref is null then
    raise exception 'Une preuve (photo ou scan QR) est requise pour le statut %', p_new_status;
  end if;

  insert into public.shipment_events (
    shipment_id, event_type, new_status, actor_user_id, actor_role,
    location_text, location_lat, location_lng, device_info,
    photo_url, qr_scan_ref, metadata
  ) values (
    p_shipment_id, p_event_type, p_new_status, v_actor, v_role,
    p_location_text, p_location_lat, p_location_lng, p_device_info,
    p_photo_url, p_qr_scan_ref, p_metadata
  )
  returning id into v_event_id;

  if p_new_status is not null then
    perform set_config('app.via_record_event', 'true', true);
    update public.shipments
    set status = p_new_status
    where id = p_shipment_id;
  end if;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-provisionnement profil + rôle 'client' par défaut à l'inscription
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');

  insert into public.user_roles (user_id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'role', 'client'));

  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- incidents (section 12)
-- ---------------------------------------------------------------------------
create table incidents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  type text not null check (type in (
    'colis_endommage', 'colis_manquant', 'retard', 'probleme_douanier',
    'mauvaise_adresse', 'destinataire_absent', 'autre'
  )),
  description text,
  photo_url text,
  location_text text,
  reported_by uuid references auth.users (id) on delete set null,
  role text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_incidents_shipment_id on incidents (shipment_id);

create trigger trg_incidents_updated_at
  before update on incidents
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications (section 6)
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  shipment_id uuid references shipments (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push', 'in_app')),
  type text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_id on notifications (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table hubs enable row level security;
alter table pickup_points enable row level security;
alter table transporters enable row level security;
alter table shipment_lots enable row level security;
alter table shipments enable row level security;
alter table shipment_events enable row level security;
alter table incidents enable row level security;
alter table notifications enable row level security;

-- Aide : l'utilisateur courant est-il admin ?
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- profiles
create policy profiles_self_select on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());

-- user_roles
create policy user_roles_self_select on user_roles for select using (user_id = auth.uid() or is_admin());
create policy user_roles_admin_write on user_roles for all using (is_admin()) with check (is_admin());

-- organizations / hubs / pickup_points / transporters : lecture publique
-- (nécessaire pour la page de suivi publique + les dashboards), écritures
-- réservées aux admins. À revoir une fois qu'un onboarding self-service par
-- organisation existera.
create policy organizations_public_read on organizations for select using (true);
create policy organizations_admin_write on organizations for all using (is_admin()) with check (is_admin());

create policy hubs_public_read on hubs for select using (true);
create policy hubs_admin_write on hubs for all using (is_admin()) with check (is_admin());

create policy pickup_points_public_read on pickup_points for select using (true);
create policy pickup_points_admin_write on pickup_points for all using (is_admin()) with check (is_admin());

create policy transporters_public_read on transporters for select using (true);
create policy transporters_admin_write on transporters for all using (is_admin()) with check (is_admin());

create policy shipment_lots_admin_all on shipment_lots for all using (is_admin()) with check (is_admin());
create policy shipment_lots_transporteur_read on shipment_lots for select using (
  exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.organization_id = (select organization_id from transporters t where t.id = shipment_lots.transporter_id)
  )
);

-- shipments : le client voit les siens ; l'agent voit ceux de son point
-- relais ; le transporteur voit ceux qui lui sont assignés ; l'admin voit
-- tout. Aucune politique SELECT publique/anon ici — le suivi public passe
-- exclusivement par get_public_tracking() (SECURITY DEFINER), qui ne
-- renvoie qu'un sous-ensemble sûr de colonnes pour ne jamais exposer les
-- coordonnées personnelles (adresses/téléphones).
create policy shipments_client_select on shipments for select using (
  client_user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from user_roles ur
    join transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.organization_id = t.organization_id
  )
);

create policy shipments_client_insert on shipments for insert with check (
  client_user_id = auth.uid() or is_admin()
);

-- La visibilité en écriture directe suit le même périmètre ; le statut
-- lui-même est protégé séparément par prevent_direct_status_change() et le
-- GRANT ciblé au niveau colonne plus bas, car RLS seul ne peut pas
-- restreindre quelles *colonnes* sont modifiables.
create policy shipments_ops_update on shipments for update using (
  is_admin()
  or exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from user_roles ur
    join transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.organization_id = t.organization_id
  )
);

-- shipment_events : append-only. L'INSERT passe exclusivement par
-- record_shipment_event() (SECURITY DEFINER) — aucune politique INSERT
-- directe n'est accordée aux utilisateurs authentifiés. La visibilité en
-- SELECT reflète celle du colis parent (Postgres réévalue les politiques
-- RLS propres de shipments avec le rôle de l'appelant lors de cette
-- sous-requête). Aucune politique UPDATE/DELETE n'existe pour personne —
-- cette absence est le mécanisme d'application de l'append-only.
create policy shipment_events_select on shipment_events for select using (
  exists (select 1 from shipments s where s.id = shipment_events.shipment_id)
);

-- incidents
create policy incidents_select on incidents for select using (
  is_admin()
  or exists (select 1 from shipments s where s.id = incidents.shipment_id)
);
create policy incidents_insert on incidents for insert with check (reported_by = auth.uid());
create policy incidents_admin_update on incidents for update using (is_admin());

-- notifications : lecture seule pour le destinataire ; les écritures sont
-- réservées au service role (pas de politique INSERT/UPDATE pour
-- authenticated — créées plus tard par une Edge Function via la clé
-- service role).
create policy notifications_self_select on notifications for select using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- Verrouillage au niveau colonne : le statut n'est jamais accordable
-- directement aux clients/opérateurs
-- ---------------------------------------------------------------------------
revoke update on shipments from authenticated;
grant update (
  weight_real_kg, dimensions_cm, current_hub_id, current_pickup_point_id,
  assigned_transporter_id, lot_id, delivery_otp, delivered_at
) on shipments to authenticated;

-- ---------------------------------------------------------------------------
-- Suivi public — sous-ensemble sûr uniquement, pas de PII, pas d'auth requise
-- ---------------------------------------------------------------------------
create or replace function get_public_tracking(p_tracking_code text)
returns table (
  tracking_code text,
  status text,
  origin_city text,
  destination_city text,
  created_at timestamptz,
  event_type text,
  event_location text,
  event_created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.tracking_code, s.status, s.origin_city, s.destination_city, s.created_at,
    e.event_type, e.location_text, e.created_at
  from public.shipments s
  left join public.shipment_events e on e.shipment_id = s.id
  where s.tracking_code = p_tracking_code
  order by e.created_at asc;
$$;

grant execute on function get_public_tracking(text) to anon, authenticated;
grant execute on function record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
) to authenticated;
