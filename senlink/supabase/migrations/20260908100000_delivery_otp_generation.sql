do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_shipment_event'
    and prosrc ilike '%at_pickup_point%then%lpad%'
  ) then
    raise exception 'PREFLIGHT FAILED: record_shipment_event génère déjà un OTP';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_tracking'
    and pg_get_function_result(p.oid) ilike '%delivery_otp%'
  ) then
    raise exception 'PREFLIGHT FAILED: get_public_tracking expose déjà delivery_otp';
  end if;
end;
$preflight$;

-- record_shipment_event : seul changement réel, la branche delivery_otp du
-- SET — génère un OTP à 6 chiffres au moment où le colis atteint
-- at_pickup_point (jusqu'ici cette colonne n'était jamais renseignée nulle
-- part, rendant 'delivered' inatteignable). Le reste du corps de la
-- fonction est copié à l'identique (diff mécaniquement vérifié avant
-- application : seule cette clause change).
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
      delivery_otp = case
        when p_new_status = 'delivered' then null
        when p_new_status = 'at_pickup_point' then lpad(floor(random() * 1000000)::text, 6, '0')
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

-- get_public_tracking : ajoute delivery_otp au résultat, visible
-- uniquement pendant que le colis est au point relais destination
-- (avant : jamais affecté ; après 'delivered' : remis à NULL par
-- record_shipment_event ci-dessus, donc naturellement masqué).
-- DROP requis : le type de retour change (nouvelle colonne).
--
-- Note de sécurité assumée : cette RPC est anon-facing (page /suivi
-- publique, sans authentification). Exposer l'OTP ici le rend aussi
-- secret que le code de suivi lui-même — décision explicite pour le
-- pilote, en l'absence d'intégration SMS/WhatsApp permettant un canal
-- séparé. À durcir plus tard si un besoin réel apparaît (ex. réserver
-- l'OTP à un client authentifié correspondant à shipments.client_user_id).
DROP FUNCTION public.get_public_tracking(text);

CREATE FUNCTION public.get_public_tracking(p_tracking_code text)
 RETURNS TABLE(tracking_code text, status text, origin_city text, destination_city text, created_at timestamp with time zone, event_type text, event_location text, event_created_at timestamp with time zone, delivery_otp text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.tracking_code, s.status, s.origin_city, s.destination_city, s.created_at,
    e.event_type, e.location_text, e.created_at,
    case when s.status = 'at_pickup_point' then s.delivery_otp else null end
  from public.shipments s
  left join public.shipment_events e on e.shipment_id = s.id
  where s.tracking_code = p_tracking_code
  order by e.created_at asc;
$function$;

grant execute on function public.get_public_tracking(text) to anon, authenticated;
