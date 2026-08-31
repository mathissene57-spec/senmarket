-- SENLINK — Migration 2 : Lots Security Core
-- Donne au transporteur un chemin d'écriture sécurisé et traçable pour
-- le cycle de vie complet d'un lot (création → départ → arrivée →
-- réconciliation → clôture), en réutilisant strictement
-- record_shipment_event() (Migration 1) pour toute transition
-- individuelle de colis — aucune logique de transition dupliquée.
--
-- Corrige au passage deux failles identifiées lors de la relecture du
-- schéma réel : les grants table-level jamais nettoyés sur
-- shipment_lots, et shipments.lot_id encore INSERT-able directement
-- (via un privilège de TABLE, pas seulement de colonne — un simple
-- REVOKE INSERT (lot_id) n'aurait aucun effet tant que le privilège de
-- table n'est pas d'abord révoqué). Corrige également, à périmètre
-- strict, l'écart RLS "organisation ne suffit pas" déjà identifié sur
-- shipments_client_select / shipments_ops_update (clause transporteur :
-- organization_id → transporter_id précis).
--
-- Vérifié par relecture inter-migrations : record_shipment_event()
-- (Migration 1) ne verrouille et ne modifie jamais shipment_lots ni
-- shipments.lot_id — aucun cycle de verrouillage possible avec les RPC
-- ci-dessous (toutes en ordre lot(s) → shipment).
--
-- lot_id reste un simple FK nullable (shipments.lot_id →
-- shipment_lots.id, ON DELETE SET NULL) : pas de table de liaison.
-- L'historique des changements est porté par shipment_lot_events, pas
-- par une deuxième structure concurrente.
--
-- Hors périmètre, volontairement : module Incidents V2 (gravité,
-- assignation), table Manifestes indépendante, Finance, Facturation,
-- Trust Score, GPS temps réel, PWA, automatisations, équipe avancée,
-- lot_ready (aucune fonction associée, retiré du périmètre).

-- ---------------------------------------------------------------------------
-- 1. Nettoyage des grants hérités sur shipment_lots
-- ---------------------------------------------------------------------------

revoke all on public.shipment_lots from anon, authenticated;
grant select on public.shipment_lots to authenticated;
-- rien à anon : donnée opérationnelle interne, pas publique comme le
-- suivi colis. Aucune écriture directe pour personne — tout passe par
-- les 10 RPC ci-dessous (SECURITY DEFINER, contournent les grants en
-- tant que propriétaire de la fonction).

-- ---------------------------------------------------------------------------
-- 2. Fermeture de shipments.lot_id à l'INSERT
--    CORRECTIF : un privilège INSERT accordé au niveau TABLE continue
--    de couvrir toutes les colonnes même si on révoque une colonne en
--    particulier — il faut révoquer le privilège de table entier puis
--    ré-accorder explicitement toutes les colonnes légitimes, sauf
--    lot_id. Sans danger pour les créations de colis existantes : le
--    flux client (shipments_client_insert) n'a jamais eu de raison
--    d'envoyer lot_id dans son payload avant l'existence même du lot.
-- ---------------------------------------------------------------------------

revoke insert on public.shipments from authenticated;
grant insert (
  id, tracking_code, client_user_id, created_by, sender_name, sender_phone,
  sender_address, origin_city, origin_country, recipient_name, recipient_phone,
  recipient_address, destination_city, destination_country, category,
  weight_declared_kg, weight_real_kg, dimensions_cm, declared_value, currency,
  photo_url, status, current_hub_id, current_pickup_point_id,
  assigned_transporter_id, qr_code_data, delivery_otp, delivered_at,
  created_at, updated_at
) on public.shipments to authenticated;
-- lot_id absente de la liste — 30 colonnes sur 31, exactement l'état
-- d'avant moins la seule colonne concernée. Aucune autre colonne
-- retouchée, même celles qui pourraient sembler questionnables
-- (status, delivery_otp...) : hors périmètre strict de cette migration.

-- ---------------------------------------------------------------------------
-- 3. Correction ciblée — shipments_client_select / shipments_ops_update
--    (clause transporteur : transporter_id précis au lieu de
--    organization_id — "l'organisation ne suffit pas à autoriser une
--    opération transporteur")
-- ---------------------------------------------------------------------------

drop policy shipments_client_select on public.shipments;
create policy shipments_client_select on public.shipments
for select
using (
  (client_user_id = auth.uid())
  or is_admin()
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from public.user_roles ur
    join public.transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.transporter_id = t.id
  )
);

drop policy shipments_ops_update on public.shipments;
create policy shipments_ops_update on public.shipments
for update
using (
  is_admin()
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from public.user_roles ur
    join public.transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.transporter_id = t.id
  )
);
-- Rien d'autre modifié dans ces deux policies (with_check reste absent,
-- exactement comme avant).

-- ---------------------------------------------------------------------------
-- 4. Policies SELECT — shipment_lots (transporteur précis + admin dédiée,
--    plus de policy ALL qui suggérerait un chemin d'écriture direct)
-- ---------------------------------------------------------------------------

drop policy shipment_lots_transporteur_read on public.shipment_lots;
create policy shipment_lots_transporteur_read on public.shipment_lots
for select
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'transporteur'
      and ur.transporter_id = shipment_lots.transporter_id
  )
);

drop policy shipment_lots_admin_all on public.shipment_lots;
create policy shipment_lots_admin_select on public.shipment_lots
for select
using (is_admin());
-- Plus aucune policy ALL/INSERT/UPDATE/DELETE sur shipment_lots, pour
-- personne — toute mutation passe exclusivement par les 10 RPC.

-- ---------------------------------------------------------------------------
-- 5. Nouvelle table — shipment_lot_events (append-only, même esprit que
--    shipment_events)
--    CORRECTIF : lot_id nullable + ON DELETE SET NULL (pas NOT NULL +
--    CASCADE) pour que cancel_empty_lot() ne détruise pas sa propre
--    trace d'audit (lot_created) quand elle supprime un lot vide.
-- ---------------------------------------------------------------------------

create table public.shipment_lot_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.shipment_lots(id) on delete set null,
  shipment_id uuid references public.shipments(id) on delete set null,
  event_type text not null check (event_type = any (array[
    'lot_created', 'shipment_added', 'shipment_removed',
    'shipment_reassigned', 'lot_departed', 'lot_arrived',
    'arrival_reconciled', 'lot_closed'
  ])),
  actor_user_id uuid not null,
  actor_role text not null,
  location_text text,
  location_lat numeric,
  location_lng numeric,
  device_info jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.shipment_lot_events enable row level security;

revoke all on public.shipment_lot_events from anon, authenticated;
grant select on public.shipment_lot_events to authenticated;

create policy shipment_lot_events_select on public.shipment_lot_events
for select
using (
  is_admin()
  or exists (
    select 1 from public.shipment_lots l
    join public.user_roles ur on ur.transporter_id = l.transporter_id
    where l.id = shipment_lot_events.lot_id
      and ur.user_id = auth.uid()
      and ur.role = 'transporteur'
  )
);
-- Conséquence assumée : un événement dont le lot a été supprimé
-- (lot_id devenu NULL après cancel_empty_lot()) ne reste visible qu'à
-- l'admin — le transporteur qui a annulé son propre lot vide perd la
-- visibilité sur cet événement, ce qui est cohérent puisque le lot
-- lui-même n'existe plus pour lui non plus.

-- ---------------------------------------------------------------------------
-- 6. Génération de lot_code (trigger, même pattern que
--    generate_shipment_tracking_code())
-- ---------------------------------------------------------------------------

create or replace function public.generate_lot_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_origin_city text;
  v_dest_city text;
  v_suffix text;
begin
  if new.lot_code is null or length(trim(new.lot_code)) = 0 then
    select upper(left(regexp_replace(city, '[^a-zA-Z]', '', 'g'), 3))
      into v_origin_city from public.hubs where id = new.origin_hub_id;
    select upper(left(regexp_replace(city, '[^a-zA-Z]', '', 'g'), 3))
      into v_dest_city from public.hubs where id = new.destination_hub_id;
    v_suffix := lpad((floor(random() * 999))::int::text, 3, '0');
    new.lot_code := 'LOT-' || coalesce(v_origin_city, 'XXX') || '-'
                     || coalesce(v_dest_city, 'XXX') || '-'
                     || to_char(now(), 'YYYYMMDD') || '-' || v_suffix;
  end if;
  return new;
end;
$$;

create trigger trg_shipment_lots_lot_code
before insert on public.shipment_lots
for each row execute function public.generate_lot_code();

-- ---------------------------------------------------------------------------
-- 7. Machine à états — is_valid_lot_transition() (créée avant le
--    trigger qui la consomme)
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_lot_transition(p_old_status text, p_new_status text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('open','in_transit'),
      ('in_transit','arrived'),
      ('arrived','closed')
    ) as t(from_status, to_status)
    where t.from_status = p_old_status and t.to_status = p_new_status
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. Protection du statut — double barrière (autorisation + transition)
-- ---------------------------------------------------------------------------

create or replace function public.prevent_direct_lot_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('app.via_lot_event', true), '') <> 'true' then
      raise exception 'shipment_lots.status ne peut être modifié que via les RPC Lots Security Core';
    end if;
    if not public.is_valid_lot_transition(old.status, new.status) then
      raise exception 'transition de lot invalide : % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_direct_lot_status_change
before update on public.shipment_lots
for each row execute function public.prevent_direct_lot_status_change();

comment on column public.shipment_lots.status is
  'État macro persistant du lot (open/in_transit/arrived/closed). '
  'Modifiable uniquement via les RPC dédiées (protégé par trigger + '
  'is_valid_lot_transition()). La granularité opérationnelle fine vit '
  'dans shipment_lot_events, jamais dans cette colonne.';

-- ---------------------------------------------------------------------------
-- 9. Les 10 RPC
-- ---------------------------------------------------------------------------

-- 9.1 create_shipment_lot()
create or replace function public.create_shipment_lot(
  p_origin_hub_id uuid,
  p_destination_hub_id uuid,
  p_transporter_id uuid default null,
  p_acting_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_is_admin boolean;
  v_transporter_id uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot_id uuid;
  v_lot_code text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  v_is_admin := public.is_admin(v_actor);

  if v_is_admin then
    if p_acting_role is not null then
      raise exception 'p_acting_role interdit pour un administrateur';
    end if;
    if p_transporter_id is null then
      raise exception 'p_transporter_id requis pour un administrateur';
    end if;
    if not exists (select 1 from public.transporters where id = p_transporter_id and active) then
      raise exception 'transporteur introuvable ou inactif';
    end if;
    v_transporter_id := p_transporter_id;
  else
    if p_transporter_id is not null then
      raise exception 'p_transporter_id interdit pour un non-administrateur';
    end if;
    if p_acting_role is null or p_acting_role <> 'transporteur' then
      raise exception 'p_acting_role doit être ''transporteur''';
    end if;
    begin
      select * into strict v_actor_ur
      from public.user_roles
      where user_id = v_actor and role = 'transporteur';
    exception
      when no_data_found then
        raise exception 'rôle transporteur non détenu par cet utilisateur';
      when too_many_rows then
        raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
    end;
    if v_actor_ur.transporter_id is null then
      raise exception 'transporteur sans fiche transporteur affectée';
    end if;
    if not exists (select 1 from public.transporters where id = v_actor_ur.transporter_id and active) then
      raise exception 'transporteur inactif';
    end if;
    v_transporter_id := v_actor_ur.transporter_id;
  end if;

  if p_origin_hub_id = p_destination_hub_id then
    raise exception 'hub d''origine et de destination identiques';
  end if;
  if not exists (select 1 from public.hubs where id = p_origin_hub_id and active) then
    raise exception 'hub d''origine introuvable ou inactif';
  end if;
  if not exists (select 1 from public.hubs where id = p_destination_hub_id and active) then
    raise exception 'hub de destination introuvable ou inactif';
  end if;

  insert into public.shipment_lots (transporter_id, origin_hub_id, destination_hub_id, status)
  values (v_transporter_id, p_origin_hub_id, p_destination_hub_id, 'open')
  returning id, lot_code into v_lot_id, v_lot_code;

  insert into public.shipment_lot_events (lot_id, actor_user_id, actor_role, event_type, metadata)
  values (v_lot_id, v_actor, case when v_is_admin then 'admin' else 'transporteur' end,
          'lot_created',
          jsonb_build_object(
            'origin_hub_id', p_origin_hub_id,
            'destination_hub_id', p_destination_hub_id,
            'lot_code', v_lot_code,
            'transporter_id', v_transporter_id
          ));

  return v_lot_id;
end;
$function$;

-- 9.2 add_shipment_to_lot()
create or replace function public.add_shipment_to_lot(
  p_lot_id uuid,
  p_shipment_id uuid,
  p_acting_role text default null
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
  v_shipment public.shipments%rowtype;
  v_lot_origin_country text;
  v_lot_dest_country text;
  v_event_id uuid;
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
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;
  if v_actor_ur.transporter_id is null then
    raise exception 'transporteur sans fiche transporteur affectée';
  end if;
  if not exists (select 1 from public.transporters where id = v_actor_ur.transporter_id and active) then
    raise exception 'transporteur inactif';
  end if;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if v_lot.status <> 'open' then
    raise exception 'lot non modifiable (statut différent de open)';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'colis introuvable'; end if;
  if v_shipment.status <> 'inspected' then
    raise exception 'colis pas encore inspecté';
  end if;
  if v_shipment.lot_id is not null then
    raise exception 'colis déjà rattaché à un lot';
  end if;

  select h1.country, h2.country into v_lot_origin_country, v_lot_dest_country
  from public.hubs h1, public.hubs h2
  where h1.id = v_lot.origin_hub_id and h2.id = v_lot.destination_hub_id;

  if v_shipment.origin_country <> v_lot_origin_country
     or v_shipment.destination_country <> v_lot_dest_country then
    raise exception 'incohérence géographique entre le colis et le lot';
  end if;

  update public.shipments set lot_id = p_lot_id where id = p_shipment_id;

  insert into public.shipment_lot_events (lot_id, shipment_id, actor_user_id, actor_role, event_type)
  values (p_lot_id, p_shipment_id, v_actor, 'transporteur', 'shipment_added')
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.3 remove_shipment_from_lot()
create or replace function public.remove_shipment_from_lot(
  p_lot_id uuid,
  p_shipment_id uuid,
  p_acting_role text default null
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
  v_shipment public.shipments%rowtype;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if v_lot.status <> 'open' then
    raise exception 'lot non modifiable (statut différent de open)';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'colis introuvable'; end if;
  if v_shipment.lot_id is distinct from p_lot_id then
    raise exception 'ce colis n''est pas rattaché à ce lot';
  end if;

  update public.shipments set lot_id = null where id = p_shipment_id;

  insert into public.shipment_lot_events (lot_id, shipment_id, actor_user_id, actor_role, event_type)
  values (p_lot_id, p_shipment_id, v_actor, 'transporteur', 'shipment_removed')
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.4 reassign_shipment_lot() — verrouillage lot(s) → shipment, avec
--     relecture de contrôle après acquisition des verrous, et contrôle
--     géographique sur le lot de destination (même invariant que
--     add_shipment_to_lot())
create or replace function public.reassign_shipment_lot(
  p_shipment_id uuid,
  p_to_lot_id uuid,
  p_acting_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_from_lot_id uuid;
  v_first_lot_id uuid;
  v_second_lot_id uuid;
  v_lot_from public.shipment_lots%rowtype;
  v_lot_to public.shipment_lots%rowtype;
  v_shipment public.shipments%rowtype;
  v_lot_to_origin_country text;
  v_lot_to_dest_country text;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  -- Lecture NON verrouillante : uniquement pour déterminer l'ordre de
  -- verrouillage des deux lots. Revérifiée sous verrou plus bas.
  select lot_id into v_from_lot_id from public.shipments where id = p_shipment_id;
  if v_from_lot_id is null then
    raise exception 'colis non rattaché à un lot';
  end if;
  if v_from_lot_id = p_to_lot_id then
    raise exception 'lot source et destination identiques';
  end if;

  -- Ordre déterministe, cohérent avec add_shipment_to_lot() /
  -- remove_shipment_from_lot() : lot(s) verrouillé(s) AVANT le colis.
  if v_from_lot_id < p_to_lot_id then
    v_first_lot_id := v_from_lot_id; v_second_lot_id := p_to_lot_id;
  else
    v_first_lot_id := p_to_lot_id; v_second_lot_id := v_from_lot_id;
  end if;
  perform 1 from public.shipment_lots where id = v_first_lot_id for update;
  perform 1 from public.shipment_lots where id = v_second_lot_id for update;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'colis introuvable'; end if;

  -- Relecture de contrôle : le colis a-t-il changé de lot entre la
  -- lecture non verrouillée et l'obtention des verrous ci-dessus ?
  if v_shipment.lot_id is distinct from v_from_lot_id then
    raise exception 'le colis a changé de lot entre-temps — réessayez';
  end if;

  select * into v_lot_from from public.shipment_lots where id = v_from_lot_id;
  select * into v_lot_to from public.shipment_lots where id = p_to_lot_id;
  if v_lot_from.id is null then raise exception 'lot source introuvable'; end if;
  if v_lot_to.id is null then raise exception 'lot destination introuvable'; end if;

  if v_lot_from.transporter_id <> v_actor_ur.transporter_id
     or v_lot_to.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if v_lot_from.status <> 'open' or v_lot_to.status <> 'open' then
    raise exception 'lot source ou destination non modifiable (statut différent de open)';
  end if;

  select h1.country, h2.country into v_lot_to_origin_country, v_lot_to_dest_country
  from public.hubs h1, public.hubs h2
  where h1.id = v_lot_to.origin_hub_id and h2.id = v_lot_to.destination_hub_id;

  if v_shipment.origin_country <> v_lot_to_origin_country
     or v_shipment.destination_country <> v_lot_to_dest_country then
    raise exception 'incohérence géographique entre le colis et le lot de destination';
  end if;

  update public.shipments set lot_id = p_to_lot_id where id = p_shipment_id;

  insert into public.shipment_lot_events (lot_id, shipment_id, actor_user_id, actor_role, event_type, metadata)
  values (p_to_lot_id, p_shipment_id, v_actor, 'transporteur', 'shipment_reassigned',
          jsonb_build_object('from_lot_id', v_from_lot_id, 'to_lot_id', p_to_lot_id))
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.5 declare_lot_departure()
create or replace function public.declare_lot_departure(
  p_lot_id uuid,
  p_acting_role text default null,
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
  v_shipment_count integer;
  v_not_inspected_count integer;
  v_shipment_id uuid;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if not public.is_valid_lot_transition(v_lot.status, 'in_transit') then
    raise exception 'transition de lot invalide : % -> in_transit', v_lot.status;
  end if;

  perform 1 from public.shipments where lot_id = p_lot_id for update;

  select count(*) into v_shipment_count from public.shipments where lot_id = p_lot_id;
  if v_shipment_count = 0 then
    raise exception 'aucun colis rattaché à ce lot';
  end if;

  select count(*) into v_not_inspected_count
  from public.shipments where lot_id = p_lot_id and status <> 'inspected';
  if v_not_inspected_count > 0 then
    raise exception '% colis non inspectés dans ce lot', v_not_inspected_count;
  end if;

  if exists (
    select 1 from public.incidents i
    join public.shipments s on s.id = i.shipment_id
    where s.lot_id = p_lot_id and i.status = 'open'
  ) then
    raise exception 'incident ouvert bloquant sur au moins un colis de ce lot';
  end if;

  for v_shipment_id in select id from public.shipments where lot_id = p_lot_id loop
    perform public.record_shipment_event(
      p_shipment_id := v_shipment_id,
      p_new_status := 'departed_origin',
      p_acting_role := 'transporteur',
      p_device_info := p_device_info,
      p_metadata := jsonb_build_object('via_lot_id', p_lot_id)
    );
  end loop;

  perform set_config('app.via_lot_event', 'true', true);
  update public.shipment_lots set status = 'in_transit', departed_at = now() where id = p_lot_id;

  insert into public.shipment_lot_events (lot_id, actor_user_id, actor_role, event_type, metadata)
  values (p_lot_id, v_actor, 'transporteur', 'lot_departed', jsonb_build_object('colis_count', v_shipment_count))
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.6 declare_lot_arrival()
create or replace function public.declare_lot_arrival(
  p_lot_id uuid,
  p_acting_role text default null
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
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if not public.is_valid_lot_transition(v_lot.status, 'arrived') then
    raise exception 'transition de lot invalide : % -> arrived', v_lot.status;
  end if;

  perform set_config('app.via_lot_event', 'true', true);
  update public.shipment_lots set status = 'arrived', arrived_at = now() where id = p_lot_id;

  insert into public.shipment_lot_events (lot_id, actor_user_id, actor_role, event_type)
  values (p_lot_id, v_actor, 'transporteur', 'lot_arrived')
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.7 get_lot_reconciliation() — LECTURE SEULE, SECURITY INVOKER
create or replace function public.get_lot_reconciliation(p_lot_id uuid)
returns table(attendu integer, recu integer, ecart integer)
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
      )
  ) then
    raise exception 'lot introuvable ou accès refusé';
  end if;

  return query
  select
    count(*)::integer as attendu,
    count(*) filter (
      where s.status in ('arrived_destination','at_hub','at_pickup_point','out_for_delivery','delivered')
    )::integer as recu,
    (count(*) - count(*) filter (
      where s.status in ('arrived_destination','at_hub','at_pickup_point','out_for_delivery','delivered')
    ))::integer as ecart
  from public.shipments s
  where s.lot_id = p_lot_id;
end;
$function$;

-- 9.8 record_lot_reconciliation()
create or replace function public.record_lot_reconciliation(
  p_lot_id uuid,
  p_acting_role text default null
)
returns table(attendu integer, recu integer, ecart integer, incident_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_attendu integer;
  v_recu integer;
  v_ecart integer;
  v_incident_ids uuid[] := '{}';
  v_missing record;
  v_incident_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if v_lot.status <> 'arrived' then
    raise exception 'lot pas encore arrivé';
  end if;
  if exists (
    select 1 from public.shipment_lot_events
    where lot_id = p_lot_id and event_type = 'arrival_reconciled'
  ) then
    raise exception 'réconciliation déjà enregistrée pour ce lot';
  end if;

  perform 1 from public.shipments where lot_id = p_lot_id for update;

  select count(*) into v_attendu from public.shipments where lot_id = p_lot_id;
  select count(*) into v_recu from public.shipments
  where lot_id = p_lot_id
    and status in ('arrived_destination','at_hub','at_pickup_point','out_for_delivery','delivered');
  v_ecart := v_attendu - v_recu;

  for v_missing in
    select id, tracking_code from public.shipments
    where lot_id = p_lot_id
      and status not in ('arrived_destination','at_hub','at_pickup_point','out_for_delivery','delivered')
  loop
    insert into public.incidents (shipment_id, type, description, status, reported_by, role)
    values (
      v_missing.id, 'colis_manquant',
      'Écart de réconciliation du lot ' || v_lot.lot_code || ' (' || v_attendu || ' attendus, ' || v_recu || ' reçus).',
      'open', v_actor, 'transporteur'
    )
    returning id into v_incident_id;
    v_incident_ids := array_append(v_incident_ids, v_incident_id);
  end loop;

  insert into public.shipment_lot_events (lot_id, actor_user_id, actor_role, event_type, metadata)
  values (p_lot_id, v_actor, 'transporteur', 'arrival_reconciled',
          jsonb_build_object('attendu', v_attendu, 'recu', v_recu, 'ecart', v_ecart,
                              'incident_ids', to_jsonb(v_incident_ids)));

  return query select v_attendu, v_recu, v_ecart, v_incident_ids;
end;
$function$;

-- 9.9 close_shipment_lot()
create or replace function public.close_shipment_lot(
  p_lot_id uuid,
  p_acting_role text default null
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
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if not public.is_valid_lot_transition(v_lot.status, 'closed') then
    raise exception 'transition de lot invalide : % -> closed', v_lot.status;
  end if;
  if not exists (
    select 1 from public.shipment_lot_events
    where lot_id = p_lot_id and event_type = 'arrival_reconciled'
  ) then
    raise exception 'réconciliation non exécutée — impossible de clôturer';
  end if;

  perform set_config('app.via_lot_event', 'true', true);
  update public.shipment_lots set status = 'closed' where id = p_lot_id;

  insert into public.shipment_lot_events (lot_id, actor_user_id, actor_role, event_type)
  values (p_lot_id, v_actor, 'transporteur', 'lot_closed')
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- 9.10 cancel_empty_lot()
create or replace function public.cancel_empty_lot(
  p_lot_id uuid,
  p_acting_role text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_shipment_count integer;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin(v_actor) then
    raise exception 'opération réservée au transporteur titulaire — non disponible pour un administrateur';
  end if;
  if p_acting_role is null or p_acting_role <> 'transporteur' then
    raise exception 'p_acting_role doit être ''transporteur''';
  end if;

  begin
    select * into strict v_actor_ur from public.user_roles
    where user_id = v_actor and role = 'transporteur';
  exception
    when no_data_found then raise exception 'rôle transporteur non détenu par cet utilisateur';
    when too_many_rows then raise exception 'affiliation ambiguë pour le rôle transporteur — non supporté en v1.0';
  end;

  select * into v_lot from public.shipment_lots where id = p_lot_id for update;
  if not found then raise exception 'lot introuvable'; end if;
  if v_lot.transporter_id <> v_actor_ur.transporter_id then
    raise exception 'colis non rattaché à ce transporteur';
  end if;
  if v_lot.status <> 'open' then
    raise exception 'lot non modifiable (statut différent de open)';
  end if;

  select count(*) into v_shipment_count from public.shipments where lot_id = p_lot_id;
  if v_shipment_count > 0 then
    raise exception 'lot non vide — suppression refusée';
  end if;

  delete from public.shipment_lots where id = p_lot_id;
  -- cascade sur shipment_lot_events désormais géré via ON DELETE SET NULL
  -- (section 5) : les événements de ce lot (uniquement lot_created,
  -- puisque le lot est garanti vide) survivent, orphelins, plutôt que
  -- d'être détruits.

  return true;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 10. Verrouillage EXECUTE — même correctif que Migration 1
--     (anon explicite, pas seulement public)
-- ---------------------------------------------------------------------------

revoke execute on function public.create_shipment_lot(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_shipment_lot(uuid, uuid, uuid, text) to authenticated;

revoke execute on function public.add_shipment_to_lot(uuid, uuid, text) from public, anon;
grant execute on function public.add_shipment_to_lot(uuid, uuid, text) to authenticated;

revoke execute on function public.remove_shipment_from_lot(uuid, uuid, text) from public, anon;
grant execute on function public.remove_shipment_from_lot(uuid, uuid, text) to authenticated;

revoke execute on function public.reassign_shipment_lot(uuid, uuid, text) from public, anon;
grant execute on function public.reassign_shipment_lot(uuid, uuid, text) to authenticated;

revoke execute on function public.declare_lot_departure(uuid, text, jsonb) from public, anon;
grant execute on function public.declare_lot_departure(uuid, text, jsonb) to authenticated;

revoke execute on function public.declare_lot_arrival(uuid, text) from public, anon;
grant execute on function public.declare_lot_arrival(uuid, text) to authenticated;

revoke execute on function public.get_lot_reconciliation(uuid) from public, anon;
grant execute on function public.get_lot_reconciliation(uuid) to authenticated;

revoke execute on function public.record_lot_reconciliation(uuid, text) from public, anon;
grant execute on function public.record_lot_reconciliation(uuid, text) to authenticated;

revoke execute on function public.close_shipment_lot(uuid, text) from public, anon;
grant execute on function public.close_shipment_lot(uuid, text) to authenticated;

revoke execute on function public.cancel_empty_lot(uuid, text) from public, anon;
grant execute on function public.cancel_empty_lot(uuid, text) to authenticated;

-- Aucun chemin d'écriture direct ne subsiste : shipment_lots et
-- shipment_lot_events n'ont plus que SELECT accordé à authenticated,
-- rien à anon, aucune policy INSERT/UPDATE/DELETE nulle part. Toute
-- mutation passe par les 10 fonctions SECURITY DEFINER ci-dessus,
-- elles-mêmes verrouillées à authenticated uniquement.
