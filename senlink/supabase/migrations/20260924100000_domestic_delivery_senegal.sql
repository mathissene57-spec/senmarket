-- SenLink — Branche 3 : livraison de colis au Sénégal (Dakar + interrégional)
--
-- Contexte : jusqu'ici shipments/record_shipment_event ne modélisaient que le
-- corridor international Maroc -> Sénégal (agent_point_relais / transporteur,
-- hubs, points relais, lots). Cette migration étend ce même moteur — au lieu
-- d'en créer un second en parallèle — pour couvrir la livraison domestique
-- sénégalaise portée par des livreurs individuels (scooter à Dakar, ou relai
-- vers un point relais en région) :
--   - service_type distingue un envoi 'corridor_ma_sn' (comportement inchangé)
--     d'un envoi 'domestic_sn' (origine ET destination SN).
--   - un rôle 'livreur' est ajouté à user_roles : contrairement à
--     'transporteur' (rattaché à une organisation, gère des lots), un livreur
--     est un individu qui se voit affecter directement un colis
--     (shipments.assigned_courier_user_id), sur le même modèle de "claim au
--     premier geste" déjà utilisé pour transporteur/assigned_transporter_id.
--   - Le flux Dakar intra-ville : created -> dropped_off (prise en charge
--     chez l'expéditeur, preuve photo + qr_scan_ref comme pour tout statut
--     protégé) -> out_for_delivery -> delivered (code de retrait, mécanisme
--     delivery_otp déjà existant, inchangé). Repli point relais si le
--     destinataire est absent : out_for_delivery -> at_pickup_point ->
--     delivered.
--   - Le flux interrégional réutilise tel quel hubs/pickup_points/lots/
--     transporteur (départ -> hub -> point relais -> livreur pour le dernier
--     kilomètre) : seule l'arête departed_origin -> at_hub est ajoutée pour
--     sauter les étapes propres au corridor international
--     (in_transit_international / customs_clearance, non pertinentes ici).
--
-- Volontairement HORS PÉRIPHÉRIE de cette migration : le canal de
-- notification (SMS/WhatsApp) qui transmettrait delivery_otp au vrai
-- destinataire reste à construire (gap déjà documenté et accepté dans
-- 20260915030000_remove_delivery_otp_from_public_tracking.sql). Cette
-- migration ne réexpose PAS delivery_otp nulle part : le mécanisme de
-- vérification par code reste interne à record_shipment_event, exactement
-- comme pour le pilote corridor actuel.

do $preflight$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_roles'::regclass
      and conname = 'user_roles_role_check'
      and pg_get_constraintdef(oid) ilike '%livreur%'
  ) then
    raise exception 'PREFLIGHT FAILED: le rôle livreur existe déjà';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'service_type'
  ) then
    raise exception 'PREFLIGHT FAILED: shipments.service_type existe déjà';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- Rôle livreur
-- ---------------------------------------------------------------------------
alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('client', 'agent_point_relais', 'transporteur', 'admin', 'org_viewer', 'transitaire', 'livreur'));

-- ---------------------------------------------------------------------------
-- shipments : service_type + affectation directe à un livreur
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column service_type text not null default 'corridor_ma_sn'
    check (service_type in ('corridor_ma_sn', 'domestic_sn')),
  add column assigned_courier_user_id uuid references auth.users (id) on delete set null;

alter table public.shipments
  add constraint shipments_domestic_sn_country check (
    service_type <> 'domestic_sn' or (origin_country = 'SN' and destination_country = 'SN')
  );

create index idx_shipments_assigned_courier_user_id on public.shipments (assigned_courier_user_id);

-- service_type : le client doit pouvoir le choisir à la création (comme
-- category, origin_city, etc.). assigned_courier_user_id reste hors de tout
-- GRANT INSERT/UPDATE pour authenticated — au même titre qu'assigned_transporter_id,
-- exclusivement positionné par record_shipment_event (SECURITY DEFINER) plus bas.
grant select (service_type, assigned_courier_user_id) on public.shipments to authenticated;
grant insert (service_type) on public.shipments to authenticated;

-- ---------------------------------------------------------------------------
-- is_role_status_allowed : ajoute les statuts qu'un livreur peut produire
-- ---------------------------------------------------------------------------
create or replace function public.is_role_status_allowed(p_role text, p_new_status text)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select exists (
    select 1 from (values
      ('client','cancelled'),
      ('agent_point_relais','dropped_off'),
      ('agent_point_relais','inspected'),
      ('agent_point_relais','at_hub'),
      ('agent_point_relais','at_pickup_point'),
      ('agent_point_relais','delivered'),
      ('agent_point_relais','cancelled'),
      ('transporteur','departed_origin'),
      ('transporteur','in_transit_international'),
      ('transporteur','customs_clearance'),
      ('transporteur','arrived_destination'),
      ('transporteur','out_for_delivery'),
      ('transporteur','cancelled'),
      ('livreur','dropped_off'),
      ('livreur','out_for_delivery'),
      ('livreur','at_pickup_point'),
      ('livreur','delivered')
    ) as t(role, new_status)
    where t.role = p_role and t.new_status = p_new_status
  );
  -- admin : court-circuite entièrement cette matrice (voir la fonction
  -- principale), jamais l'OTP, jamais les invariants de chaîne de garde.
$function$;

-- ---------------------------------------------------------------------------
-- is_valid_transition : ajoute les arêtes du flux domestique
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_transition(p_old_status text, p_new_status text)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select exists (
    select 1 from (values
      ('created','dropped_off'),
      ('dropped_off','inspected'),
      ('inspected','departed_origin'),
      ('departed_origin','in_transit_international'),
      ('departed_origin','at_hub'),                  -- domestique : pas de douane à sauter
      ('in_transit_international','customs_clearance'),
      ('customs_clearance','arrived_destination'),
      ('arrived_destination','at_hub'),
      ('at_hub','at_pickup_point'),
      ('at_hub','out_for_delivery'),                  -- livreur dépêché directement depuis un hub
      ('at_pickup_point','out_for_delivery'),
      ('at_pickup_point','delivered'),      -- bypass pilote : out_for_delivery non utilisé
      ('out_for_delivery','delivered'),
      ('dropped_off','out_for_delivery'),             -- Dakar intra-ville : pas de hub/point relais intermédiaire
      ('out_for_delivery','at_pickup_point'),          -- repli si destinataire absent
      ('created','cancelled'), ('dropped_off','cancelled'), ('inspected','cancelled'),
      ('departed_origin','cancelled'), ('in_transit_international','cancelled'),
      ('customs_clearance','cancelled'), ('arrived_destination','cancelled'),
      ('at_hub','cancelled'), ('at_pickup_point','cancelled'), ('out_for_delivery','cancelled')
      -- pas d'arête depuis 'delivered' (terminal, delivered -> cancelled interdit)
      -- pas d'arête depuis 'cancelled' (terminal)
    ) as t(from_status, to_status)
    where t.from_status = p_old_status and t.to_status = p_new_status
  );
$function$;

-- ---------------------------------------------------------------------------
-- record_shipment_event : ajoute la branche livreur (claim direct sur
-- assigned_courier_user_id, sur le même modèle que le claim transporteur sur
-- assigned_transporter_id) + relâche les invariants de chaîne de garde qui
-- supposaient jusqu'ici un transporteur/point relais pour tout colis.
-- Corps entièrement recopié depuis la version live (vérifié via
-- pg_get_functiondef avant écriture) ; seuls les points marqués +++ changent.
-- ---------------------------------------------------------------------------
create or replace function public.record_shipment_event(p_shipment_id uuid, p_new_status text, p_acting_role text DEFAULT NULL::text, p_location_text text DEFAULT NULL::text, p_location_lat numeric DEFAULT NULL::numeric, p_location_lng numeric DEFAULT NULL::numeric, p_photo_url text DEFAULT NULL::text, p_qr_scan_ref text DEFAULT NULL::text, p_otp text DEFAULT NULL::text, p_device_info jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid;
  v_shipment public.shipments%rowtype;
  v_actor_role text;
  v_actor_ur public.user_roles%rowtype;
  v_is_admin boolean;
  v_requires_proof boolean;
  v_event_type text;
  v_event_id uuid;
  v_next_pickup_point_id uuid;
  v_next_hub_id uuid;
  v_next_transporter_id uuid;
  v_next_courier_id uuid; -- +++ livreur
  v_clear_pickup_point boolean := false;
begin
  -- AUTH_REQUIRED
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  v_is_admin := public.is_admin();

  -- LOCK
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'colis introuvable';
  end if;

  -- p_acting_role : exclusivité stricte avec le statut admin
  if v_is_admin then
    if p_acting_role is not null then
      raise exception 'p_acting_role interdit pour un administrateur';
    end if;
  else
    if p_acting_role is null then
      raise exception 'p_acting_role requis pour un appel non-admin';
    end if;
    if p_acting_role not in ('client', 'agent_point_relais', 'transporteur', 'livreur') then -- +++
      raise exception 'p_acting_role invalide : %', p_acting_role;
    end if;
  end if;

  -- ROLE / AFFILIATION / CLAIMING
  if not v_is_admin then
    begin
      select * into strict v_actor_ur
      from public.user_roles
      where user_id = v_actor and role = p_acting_role;
    exception
      when no_data_found then
        raise exception 'rôle % non détenu par cet utilisateur', p_acting_role;
      when too_many_rows then
        raise exception 'affiliation ambiguë pour le rôle % (plusieurs affectations) — non supporté en v1.0', p_acting_role;
    end;

    v_actor_role := v_actor_ur.role;

    if not public.is_role_status_allowed(v_actor_role, p_new_status) then
      raise exception 'le rôle % n''est pas autorisé à produire le statut %', v_actor_role, p_new_status;
    end if;

    if v_actor_role = 'client' then
      if v_shipment.client_user_id is distinct from v_actor then
        raise exception 'ce colis n''appartient pas à cet utilisateur';
      end if;
      if v_shipment.status <> 'created' then
        raise exception 'un client ne peut annuler un colis qu''à l''état created';
      end if;
    end if;

    if v_actor_role = 'agent_point_relais' then
      if p_new_status in ('dropped_off','inspected','at_pickup_point','delivered') then
        if v_actor_ur.pickup_point_id is null then
          raise exception 'agent sans point relais affecté';
        end if;
        if not exists (
          select 1 from public.pickup_points
          where id = v_actor_ur.pickup_point_id and active
        ) then
          raise exception 'point relais inactif';
        end if;

        if p_new_status in ('dropped_off','at_pickup_point') then
          if v_shipment.current_pickup_point_id is not null
             and v_shipment.current_pickup_point_id <> v_actor_ur.pickup_point_id then
            raise exception 'colis déjà affecté à un autre point relais';
          end if;
          v_next_pickup_point_id := v_actor_ur.pickup_point_id;
        else
          if v_shipment.current_pickup_point_id is null
             or v_shipment.current_pickup_point_id <> v_actor_ur.pickup_point_id then
            raise exception 'colis non affecté à ce point relais';
          end if;
        end if;
      end if;

      if p_new_status = 'at_hub' then
        if v_actor_ur.hub_id is null then
          raise exception 'agent sans hub affecté';
        end if;
        if not exists (
          select 1 from public.hubs where id = v_actor_ur.hub_id and active
        ) then
          raise exception 'hub inactif';
        end if;
        if v_shipment.current_hub_id is not null
           and v_shipment.current_hub_id <> v_actor_ur.hub_id then
          raise exception 'colis déjà affecté à un autre hub';
        end if;
        v_next_hub_id := v_actor_ur.hub_id;
      end if;
    end if;

    if v_actor_role = 'transporteur' then
      if v_actor_ur.transporter_id is null then
        raise exception 'transporteur sans fiche transporteur affectée';
      end if;
      if not exists (
        select 1 from public.transporters where id = v_actor_ur.transporter_id and active
      ) then
        raise exception 'transporteur inactif';
      end if;

      if p_new_status = 'departed_origin' then
        if v_shipment.assigned_transporter_id is not null
           and v_shipment.assigned_transporter_id <> v_actor_ur.transporter_id then
          raise exception 'colis déjà pris en charge par un autre transporteur';
        end if;
        v_next_transporter_id := v_actor_ur.transporter_id;
        v_clear_pickup_point := true;
      else
        if v_shipment.assigned_transporter_id is null
           or v_shipment.assigned_transporter_id <> v_actor_ur.transporter_id then
          raise exception 'colis non pris en charge par ce transporteur';
        end if;
      end if;
    end if;

    -- +++ livreur : claim direct sur assigned_courier_user_id, dès la prise
    -- en charge (dropped_off, Dakar intra-ville) ou dès la prise en charge du
    -- dernier kilomètre (out_for_delivery, cas interrégional où le livreur
    -- n'est pas celui qui a fait la collecte d'origine).
    if v_actor_role = 'livreur' then
      if p_new_status in ('dropped_off', 'out_for_delivery') then
        if v_shipment.assigned_courier_user_id is not null
           and v_shipment.assigned_courier_user_id <> v_actor then
          raise exception 'colis déjà pris en charge par un autre livreur';
        end if;
        v_next_courier_id := v_actor;
      else
        if v_shipment.assigned_courier_user_id is null
           or v_shipment.assigned_courier_user_id <> v_actor then
          raise exception 'colis non pris en charge par ce livreur';
        end if;
      end if;
    end if;

  else
    -- ADMIN : ne claim jamais. Les transitions de prise en charge
    -- (qui n'ont de sens que produites par un acteur opérationnel réel)
    -- lui sont explicitement interdites. Le graphe (y compris
    -- cancellation depuis la plupart des statuts) reste sinon disponible.
    if p_new_status in ('dropped_off', 'at_pickup_point', 'at_hub', 'departed_origin') then
      raise exception 'un administrateur ne peut pas initier une prise en charge opérationnelle (%) — doit être réalisée par l''acteur opérationnel réel', p_new_status;
    end if;
  end if;

  -- INVARIANTS DE CHAÎNE DE GARDE — universels, admin inclus
  if p_new_status = 'departed_origin' and v_shipment.current_pickup_point_id is null then
    raise exception 'aucun point relais d''origine enregistré pour ce colis — départ refusé';
  end if;

  -- +++ un colis en chaîne de garde livreur (Dakar intra-ville) n'a jamais de
  -- point relais courant : l'invariant se satisfait aussi par ce chemin-là.
  if p_new_status in ('inspected', 'delivered')
     and v_shipment.current_pickup_point_id is null
     and v_shipment.assigned_courier_user_id is null then
    raise exception 'aucun point relais affecté à ce colis — transition refusée';
  end if;

  -- +++ idem : out_for_delivery peut être porté par un livreur affecté
  -- directement, sans transporteur (Dakar intra-ville).
  if p_new_status in (
       'at_hub', 'at_pickup_point', 'in_transit_international',
       'customs_clearance', 'arrived_destination', 'out_for_delivery'
     )
     and v_shipment.assigned_transporter_id is null
     and v_shipment.assigned_courier_user_id is null then
    raise exception 'aucun transporteur ni livreur affecté à ce colis — transition refusée';
  end if;

  -- TRANSITION
  if not public.is_valid_transition(v_shipment.status, p_new_status) then
    raise exception 'transition invalide : % -> %', v_shipment.status, p_new_status;
  end if;

  -- PREUVE : chaîne vide/blanche rejetée, le QR n'est jamais une preuve à lui
  -- seul (il est conservé dans qr_scan_ref, en corroboration, jamais comme
  -- substitut à la photo — décision déjà actée pour le corridor, inchangée ici).
  v_requires_proof := p_new_status in
    ('dropped_off', 'inspected', 'arrived_destination', 'at_pickup_point', 'delivered');
  if v_requires_proof and nullif(trim(p_photo_url), '') is null then
    raise exception 'preuve photo requise pour le statut %', p_new_status;
  end if;

  -- OTP : obligatoire pour 'delivered', y compris pour un admin
  if p_new_status = 'delivered' then
    if v_shipment.delivery_otp is null then
      raise exception 'aucun code de retrait actif pour ce colis';
    end if;
    if p_otp is null or p_otp <> v_shipment.delivery_otp then
      raise exception 'code de retrait invalide';
    end if;
  end if;

  v_event_type := public.derive_event_type(p_new_status);

  perform set_config('app.via_record_event', 'true', true);

  update public.shipments
  set status = p_new_status,
      current_pickup_point_id = case
        when v_clear_pickup_point then null
        else coalesce(v_next_pickup_point_id, current_pickup_point_id)
      end,
      current_hub_id = coalesce(v_next_hub_id, current_hub_id),
      assigned_transporter_id = coalesce(v_next_transporter_id, assigned_transporter_id),
      assigned_courier_user_id = coalesce(v_next_courier_id, assigned_courier_user_id), -- +++
      delivery_otp = case
        when p_new_status = 'delivered' then null
        when p_new_status in ('at_pickup_point', 'out_for_delivery') then lpad(floor(random() * 1000000)::text, 6, '0') -- +++
        else delivery_otp
      end,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = p_shipment_id;

  insert into public.shipment_events (
    shipment_id, event_type, new_status, actor_user_id, actor_role,
    location_text, location_lat, location_lng, device_info,
    photo_url, qr_scan_ref, metadata
  ) values (
    p_shipment_id, v_event_type, p_new_status, v_actor,
    case when v_is_admin then 'admin' else v_actor_role end,
    p_location_text, p_location_lat, p_location_lng, p_device_info,
    p_photo_url, p_qr_scan_ref, p_metadata
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- livreur_lookup_shipment : même besoin et même modèle de confiance que
-- agent_lookup_shipment (20260908101500) — un livreur qui connaît déjà un
-- code de suivi (remis par l'expéditeur, ou scanné) doit pouvoir le
-- retrouver pour agir dessus, y compris avant que le colis ne lui soit
-- affecté (assigned_courier_user_id encore null, donc invisible via la RLS
-- normale de shipments).
-- ---------------------------------------------------------------------------
create function public.livreur_lookup_shipment(p_tracking_code text)
 returns table(
   id uuid, tracking_code text, status text, service_type text,
   sender_name text, sender_phone text, sender_address text,
   recipient_name text, recipient_phone text, recipient_address text,
   origin_city text, destination_city text,
   assigned_courier_user_id uuid, current_pickup_point_id uuid,
   current_hub_id uuid, assigned_transporter_id uuid
 )
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = v_actor and role = 'livreur'
  ) then
    raise exception 'rôle livreur non détenu par cet utilisateur';
  end if;

  return query
  select s.id, s.tracking_code, s.status, s.service_type,
         s.sender_name, s.sender_phone, s.sender_address,
         s.recipient_name, s.recipient_phone, s.recipient_address,
         s.origin_city, s.destination_city,
         s.assigned_courier_user_id, s.current_pickup_point_id,
         s.current_hub_id, s.assigned_transporter_id
  from public.shipments s
  where s.tracking_code = p_tracking_code;
end;
$function$;

grant execute on function public.livreur_lookup_shipment(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS : un livreur voit/agit sur les colis qui lui sont affectés
-- (assigned_courier_user_id = auth.uid()), au même titre qu'un transporteur
-- sur assigned_transporter_id. DROP+CREATE (pas d'OR REPLACE pour une policy).
-- ---------------------------------------------------------------------------
drop policy shipments_client_select on public.shipments;
create policy shipments_client_select on public.shipments for select using (
  client_user_id = (select auth.uid())
  or (select public.is_admin())
  or assigned_courier_user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from public.user_roles ur
    join public.transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = (select auth.uid())
      and ur.role = 'transporteur'
      and ur.transporter_id = t.id
  )
);

drop policy shipments_ops_update on public.shipments;
create policy shipments_ops_update on public.shipments for update using (
  (select public.is_admin())
  or assigned_courier_user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'agent_point_relais'
      and ur.pickup_point_id = shipments.current_pickup_point_id
  )
  or exists (
    select 1 from public.user_roles ur
    join public.transporters t on t.id = shipments.assigned_transporter_id
    where ur.user_id = (select auth.uid())
      and ur.role = 'transporteur'
      and ur.transporter_id = t.id
  )
);

-- Aucun nouveau GRANT EXECUTE requis pour is_role_status_allowed,
-- is_valid_transition ou record_shipment_event : CREATE OR REPLACE FUNCTION
-- conserve les privilèges existants tant que la signature ne change pas
-- (vérifié : aucune des trois n'a changé de signature ici).
