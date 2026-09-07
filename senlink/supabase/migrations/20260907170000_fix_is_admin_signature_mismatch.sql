-- Correctif critique : is_admin(uuid) n'existe pas, is_admin() (0 argument)
-- existe seul. 14 fonctions SECURITY DEFINER / STABLE appellent
-- public.is_admin(v_actor) ou public.is_admin(auth.uid()) et échouent à
-- 100% pour tout appelant depuis leur création. Correctif strictement
-- neutre : v_actor / auth.uid() est dans chaque cas exactement ce que
-- is_admin() recalcule déjà en interne -- aucun changement de
-- comportement, de signature, de sécurité ou de grant.

do $preflight$
declare
  v_missing_sig text;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'PREFLIGHT FAILED: is_admin() introuvable';
  end if;
  if to_regprocedure('public.is_admin(uuid)') is not null then
    raise exception 'PREFLIGHT FAILED: is_admin(uuid) existe déjà -- le bug supposé n''est plus présent, ne pas appliquer ce correctif tel quel';
  end if;

  for v_missing_sig in
    select unnest(array[
      'public.add_shipment_to_lot(uuid,uuid,text)',
      'public.cancel_empty_lot(uuid,text)',
      'public.close_shipment_lot(uuid,text)',
      'public.create_shipment_lot(uuid,uuid,uuid,text)',
      'public.declare_lot_arrival(uuid,text)',
      'public.declare_lot_departure(uuid,text,jsonb)',
      'public.reassign_shipment_lot(uuid,uuid,text)',
      'public.record_lot_location(uuid,numeric,numeric,text,numeric,numeric,numeric,jsonb)',
      'public.record_lot_reconciliation(uuid,text)',
      'public.record_shipment_event(uuid,text,text,text,numeric,numeric,text,text,text,jsonb,jsonb)',
      'public.remove_shipment_from_lot(uuid,uuid,text)',
      'public.get_lot_last_location(uuid)',
      'public.get_lot_location_history(uuid,timestamp with time zone,integer)',
      'public.get_lot_reconciliation(uuid)'
    ])
  loop
    if to_regprocedure(v_missing_sig) is null then
      raise exception 'PREFLIGHT FAILED: fonction attendue introuvable : %', v_missing_sig;
    end if;
    if pg_get_functiondef(v_missing_sig::regprocedure) not like '%is_admin(v_actor)%'
       and pg_get_functiondef(v_missing_sig::regprocedure) not like '%is_admin(auth.uid())%' then
      raise exception 'PREFLIGHT FAILED: % ne contient plus l''appel cassé attendu -- état inattendu, STOP', v_missing_sig;
    end if;
  end loop;
end;
$preflight$;

-- 1) record_shipment_event
CREATE OR REPLACE FUNCTION public.record_shipment_event(p_shipment_id uuid, p_new_status text, p_acting_role text DEFAULT NULL::text, p_location_text text DEFAULT NULL::text, p_location_lat numeric DEFAULT NULL::numeric, p_location_lng numeric DEFAULT NULL::numeric, p_photo_url text DEFAULT NULL::text, p_qr_scan_ref text DEFAULT NULL::text, p_otp text DEFAULT NULL::text, p_device_info jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if p_acting_role not in ('client', 'agent_point_relais', 'transporteur') then
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

  if p_new_status in ('inspected', 'delivered') and v_shipment.current_pickup_point_id is null then
    raise exception 'aucun point relais affecté à ce colis — transition refusée';
  end if;

  if p_new_status in (
       'at_hub', 'at_pickup_point', 'in_transit_international',
       'customs_clearance', 'arrived_destination', 'out_for_delivery'
     )
     and v_shipment.assigned_transporter_id is null then
    raise exception 'aucun transporteur affecté à ce colis — transition refusée';
  end if;

  -- TRANSITION
  if not public.is_valid_transition(v_shipment.status, p_new_status) then
    raise exception 'transition invalide : % -> %', v_shipment.status, p_new_status;
  end if;

  -- PREUVE : chaîne vide/blanche rejetée, le QR n'est jamais une preuve
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
      delivery_otp = case when p_new_status = 'delivered' then null else delivery_otp end,
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

-- 2) add_shipment_to_lot
CREATE OR REPLACE FUNCTION public.add_shipment_to_lot(p_lot_id uuid, p_shipment_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public.is_admin() then
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

-- 3) cancel_empty_lot
CREATE OR REPLACE FUNCTION public.cancel_empty_lot(p_lot_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_shipment_count integer;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin() then
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

  return true;
end;
$function$;

-- 4) close_shipment_lot
CREATE OR REPLACE FUNCTION public.close_shipment_lot(p_lot_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin() then
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

-- 5) create_shipment_lot
CREATE OR REPLACE FUNCTION public.create_shipment_lot(p_origin_hub_id uuid, p_destination_hub_id uuid, p_transporter_id uuid DEFAULT NULL::uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_is_admin := public.is_admin();

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

-- 6) declare_lot_arrival
CREATE OR REPLACE FUNCTION public.declare_lot_arrival(p_lot_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin() then
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

-- 7) declare_lot_departure
CREATE OR REPLACE FUNCTION public.declare_lot_departure(p_lot_id uuid, p_acting_role text DEFAULT NULL::text, p_device_info jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public.is_admin() then
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

-- 8) reassign_shipment_lot
CREATE OR REPLACE FUNCTION public.reassign_shipment_lot(p_shipment_id uuid, p_to_lot_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public.is_admin() then
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

  select lot_id into v_from_lot_id from public.shipments where id = p_shipment_id;
  if v_from_lot_id is null then
    raise exception 'colis non rattaché à un lot';
  end if;
  if v_from_lot_id = p_to_lot_id then
    raise exception 'lot source et destination identiques';
  end if;

  if v_from_lot_id < p_to_lot_id then
    v_first_lot_id := v_from_lot_id; v_second_lot_id := p_to_lot_id;
  else
    v_first_lot_id := p_to_lot_id; v_second_lot_id := v_from_lot_id;
  end if;
  perform 1 from public.shipment_lots where id = v_first_lot_id for update;
  perform 1 from public.shipment_lots where id = v_second_lot_id for update;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'colis introuvable'; end if;

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

-- 9) record_lot_location
CREATE OR REPLACE FUNCTION public.record_lot_location(p_lot_id uuid, p_latitude numeric, p_longitude numeric, p_acting_role text DEFAULT NULL::text, p_accuracy_m numeric DEFAULT NULL::numeric, p_speed_kmh numeric DEFAULT NULL::numeric, p_heading_degrees numeric DEFAULT NULL::numeric, p_device_info jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if public.is_admin() then
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

-- 10) record_lot_reconciliation
CREATE OR REPLACE FUNCTION public.record_lot_reconciliation(p_lot_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS TABLE(attendu integer, recu integer, ecart integer, incident_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public.is_admin() then
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

-- 11) remove_shipment_from_lot
CREATE OR REPLACE FUNCTION public.remove_shipment_from_lot(p_lot_id uuid, p_shipment_id uuid, p_acting_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
  v_lot public.shipment_lots%rowtype;
  v_shipment public.shipments%rowtype;
  v_event_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'authentification requise'; end if;
  if public.is_admin() then
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

-- 12) get_lot_last_location
CREATE OR REPLACE FUNCTION public.get_lot_last_location(p_lot_id uuid)
 RETURNS TABLE(id uuid, latitude numeric, longitude numeric, accuracy_m numeric, speed_kmh numeric, heading_degrees numeric, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.shipment_lots l
    where l.id = p_lot_id
      and (
        public.is_admin()
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

-- 13) get_lot_location_history
CREATE OR REPLACE FUNCTION public.get_lot_location_history(p_lot_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, latitude numeric, longitude numeric, accuracy_m numeric, speed_kmh numeric, heading_degrees numeric, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_limit integer;
begin
  if not exists (
    select 1 from public.shipment_lots l
    where l.id = p_lot_id
      and (
        public.is_admin()
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

-- 14) get_lot_reconciliation
CREATE OR REPLACE FUNCTION public.get_lot_reconciliation(p_lot_id uuid)
 RETURNS TABLE(attendu integer, recu integer, ecart integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.shipment_lots l
    where l.id = p_lot_id
      and (
        public.is_admin()
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
