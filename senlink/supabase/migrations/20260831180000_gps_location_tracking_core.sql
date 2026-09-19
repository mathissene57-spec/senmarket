-- SENLINK — Migration 3 : GPS / Location Tracking Core
-- Ajoute un journal append-only de positions GPS rattaché exclusivement à
-- un shipment_lot (jamais à un colis individuel, jamais directement à un
-- transporteur — transporter_id se lit toujours via
-- shipment_lots.transporter_id, une seule source de vérité).
--
-- Décisions verrouillées (rounds de conception Étape 1 / Étape 2) :
--   1. Ancrage : lot_id uniquement, aucune colonne transporter_id séparée.
--   2. Fenêtre d'écriture : uniquement pendant shipment_lots.status =
--      'in_transit' — aucun nouvel état introduit, réutilise le cycle de
--      vie déjà défini par Migration 2 (is_valid_lot_transition()).
--   3. Rétention : historique conservé intégralement en v1.0, aucune
--      purge automatique — sujet distinct à traiter avec des données de
--      volumétrie réelles.
--   4. Lecture : authentifié uniquement. Client → lots contenant ses
--      colis (shipments.client_user_id). Transporteur → ses propres lots
--      (user_roles.transporter_id). Admin → accès complet. Aucun accès
--      anon/public — à la différence de get_public_tracking(), une
--      position GPS temps réel reste une donnée protégée.
--   5. Écriture : exclusivement via record_lot_location() (SECURITY
--      DEFINER) — même axiome non négociable que Migrations 1 et 2,
--      aucune écriture directe possible sur la table.
--
-- record_lot_location() suit exactement la charpente déjà appliquée dans
-- declare_lot_departure()/close_shipment_lot() (Migration 2) : rejet
-- explicite de is_admin() avant même de vérifier p_acting_role (le GPS
-- est une opération terrain transporteur, pas un backfill administratif),
-- p_acting_role = 'transporteur' obligatoire, select ... into strict sur
-- user_roles (jamais un LIMIT 1 qui choisirait arbitrairement en cas
-- d'anomalie), statut du lot revérifié en base plutôt que supposé côté
-- client, coordonnées revalidées en plus des CHECK de table (défense en
-- profondeur).
--
-- get_lot_last_location()/get_lot_location_history() suivent le motif de
-- get_lot_reconciliation() (Migration 2) : SECURITY INVOKER mais avec un
-- contrôle d'accès EXPLICITE en tête de fonction, jamais une protection
-- reposant uniquement sur la RLS implicite — leçon stats_clients_boutique
-- côté SenMarket (une fonction SECURITY INVOKER "protégée" seulement par
-- l'absence de SECURITY DEFINER redevient dangereuse dès qu'on y touche
-- sans connaître cette raison implicite).
--
-- p_device_info est accepté en JSONB libre et stocké tel quel en v1.0,
-- sans validation de taille — décision explicite pour ne pas élargir le
-- périmètre de ce chantier (position + sécurité + historique uniquement).
-- Normalisation/bornage éventuel du device_info : sujet distinct, futur.
--
-- Vérifié par relecture inter-migrations : record_lot_location() ne
-- verrouille jamais shipment_lots ni shipments (deux SELECT non
-- verrouillés, puis un INSERT). Le seul verrou est celui que Postgres
-- pose automatiquement pour la contrainte FOREIGN KEY (lot_id →
-- shipment_lots.id) : un FOR KEY SHARE de courte durée sur la ligne
-- shipment_lots visée, compatible avec le FOR NO KEY UPDATE que
-- declare_lot_arrival()/close_shipment_lot() acquièrent en modifiant
-- status (colonne non-clé) — ces deux modes ne se bloquent jamais
-- mutuellement dans Postgres. Aucune fonction de Migration 1 ou 2 ne
-- touche shipment_lot_locations : aucun cycle de verrouillage possible
-- entre les trois migrations.
--
-- Migrations 1 et 2 ne sont ni modifiées ni recréées par ce fichier.
--
-- Hors périmètre, volontairement : remontée différée/offline (pas de
-- p_measured_at fourni par le client — recorded_at est exclusivement
-- généré côté serveur), bypass admin en écriture, purge/rétention,
-- normalisation de device_info, reconstruction de trajet prévisionnel,
-- alerte perte de signal, qualité/précision affichée à l'utilisateur.

-- ============================================================
-- 1. Table shipment_lot_locations
-- ============================================================

create table public.shipment_lot_locations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.shipment_lots(id) on delete restrict,
  recorded_by uuid not null,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  accuracy_m numeric check (accuracy_m is null or accuracy_m >= 0),
  speed_kmh numeric check (speed_kmh is null or speed_kmh >= 0),
  heading_degrees numeric check (heading_degrees is null or heading_degrees between 0 and 360),
  device_info jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index shipment_lot_locations_lot_id_recorded_at_idx
  on public.shipment_lot_locations (lot_id, recorded_at desc);

comment on table public.shipment_lot_locations is
  'Journal append-only des positions GPS d''un shipment_lot en transit. Écriture exclusivement '
  'via record_lot_location() (SECURITY DEFINER). Aucune politique UPDATE/DELETE : historique '
  'conservé intégralement en v1.0, pas de purge (décision Étape 1 point 3).';

alter table public.shipment_lot_locations enable row level security;

revoke all on public.shipment_lot_locations from anon, authenticated;
grant select on public.shipment_lot_locations to authenticated;

create policy shipment_lot_locations_select on public.shipment_lot_locations
for select
using (
  public.is_admin()
  or exists (
    select 1 from public.shipment_lots l
    join public.user_roles ur on ur.transporter_id = l.transporter_id
    where l.id = shipment_lot_locations.lot_id
      and ur.user_id = auth.uid()
      and ur.role = 'transporteur'
  )
  or exists (
    select 1 from public.shipments s
    where s.lot_id = shipment_lot_locations.lot_id
      and s.client_user_id = auth.uid()
  )
);

-- ============================================================
-- 2. record_lot_location() — seule porte d'écriture
-- ============================================================

create or replace function public.record_lot_location(
  p_lot_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_acting_role text default null,
  p_accuracy_m numeric default null,
  p_speed_kmh numeric default null,
  p_heading_degrees numeric default null,
  p_device_info jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_location_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;

  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;

  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_lot from public.shipment_lots where id = p_lot_id;
  exception
    when no_data_found then
      raise exception 'lot introuvable';
  end;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor
      and role = 'transporteur'
      and transporter_id = v_lot.transporter_id;
  exception
    when no_data_found then
      raise exception 'transporteur non habilité pour ce lot';
    when too_many_rows then
      raise exception 'affectation transporteur ambiguë pour cet utilisateur';
  end;

  if v_lot.status <> 'in_transit' then
    raise exception 'positions GPS refusées : le lot n''est pas en transit (statut actuel: %)', v_lot.status;
  end if;

  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then
    raise exception 'latitude invalide';
  end if;
  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'longitude invalide';
  end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then
    raise exception 'accuracy_m invalide';
  end if;
  if p_speed_kmh is not null and p_speed_kmh < 0 then
    raise exception 'speed_kmh invalide';
  end if;
  if p_heading_degrees is not null and (p_heading_degrees < 0 or p_heading_degrees > 360) then
    raise exception 'heading_degrees invalide';
  end if;

  insert into public.shipment_lot_locations (
    lot_id, recorded_by, latitude, longitude, accuracy_m, speed_kmh, heading_degrees,
    device_info, recorded_at
  ) values (
    p_lot_id, v_actor, p_latitude, p_longitude, p_accuracy_m, p_speed_kmh, p_heading_degrees,
    coalesce(p_device_info, '{}'::jsonb), now()
  )
  returning id into v_location_id;

  return v_location_id;
end;
$function$;

-- ============================================================
-- 3. get_lot_last_location()
-- ============================================================

create or replace function public.get_lot_last_location(p_lot_id uuid)
returns table (
  id uuid, latitude numeric, longitude numeric, accuracy_m numeric,
  speed_kmh numeric, heading_degrees numeric, recorded_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
stable
as $function$
begin
  if not exists (
    select 1 from public.shipment_lots l
    where l.id = p_lot_id
      and (
        public.is_admin(auth.uid())
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'transporteur'
            and ur.transporter_id = l.transporter_id
        )
        or exists (
          select 1 from public.shipments s
          where s.lot_id = l.id and s.client_user_id = auth.uid()
        )
      )
  ) then
    raise exception 'lot introuvable ou accès refusé';
  end if;

  return query
  select sl.id, sl.latitude, sl.longitude, sl.accuracy_m, sl.speed_kmh, sl.heading_degrees, sl.recorded_at
  from public.shipment_lot_locations sl
  where sl.lot_id = p_lot_id
  order by sl.recorded_at desc
  limit 1;
end;
$function$;

-- ============================================================
-- 4. get_lot_location_history()
-- ============================================================

create or replace function public.get_lot_location_history(
  p_lot_id uuid,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns table (
  id uuid, latitude numeric, longitude numeric, accuracy_m numeric,
  speed_kmh numeric, heading_degrees numeric, recorded_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
stable
as $function$
declare
  v_limit integer;
begin
  if not exists (
    select 1 from public.shipment_lots l
    where l.id = p_lot_id
      and (
        public.is_admin(auth.uid())
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'transporteur'
            and ur.transporter_id = l.transporter_id
        )
        or exists (
          select 1 from public.shipments s
          where s.lot_id = l.id and s.client_user_id = auth.uid()
        )
      )
  ) then
    raise exception 'lot introuvable ou accès refusé';
  end if;

  if p_limit is null then
    v_limit := 500;
  elsif p_limit <= 0 then
    raise exception 'p_limit doit être strictement positif';
  elsif p_limit > 2000 then
    v_limit := 2000;
  else
    v_limit := p_limit;
  end if;

  return query
  select sl.id, sl.latitude, sl.longitude, sl.accuracy_m, sl.speed_kmh, sl.heading_degrees, sl.recorded_at
  from public.shipment_lot_locations sl
  where sl.lot_id = p_lot_id
    and (p_since is null or sl.recorded_at >= p_since)
  order by sl.recorded_at desc
  limit v_limit;
end;
$function$;

-- ============================================================
-- 5. Grants EXECUTE
-- ============================================================

revoke execute on function public.record_lot_location(uuid, numeric, numeric, text, numeric, numeric, numeric, jsonb) from public, anon;
grant execute on function public.record_lot_location(uuid, numeric, numeric, text, numeric, numeric, numeric, jsonb) to authenticated;

revoke execute on function public.get_lot_last_location(uuid) from public, anon;
grant execute on function public.get_lot_last_location(uuid) to authenticated;

revoke execute on function public.get_lot_location_history(uuid, timestamptz, integer) from public, anon;
grant execute on function public.get_lot_location_history(uuid, timestamptz, integer) to authenticated;
