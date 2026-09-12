-- SENLINK — Migration 1 : Security Core
-- Remplace l'ancienne record_shipment_event() (10 paramètres, sans
-- machine à états ni claiming) par une version durcie : rôle explicite,
-- claiming borné aux transitions de prise en charge réelle, acteurs
-- actifs obligatoires, invariants de chaîne de garde universels (admin
-- inclus), OTP non contournable même par l'admin, QR jamais traité
-- comme une preuve, annulation client bornée à l'état created avec
-- vérification d'ownership.
--
-- lot_id est volontairement fermé en écriture (direct ET RPC) dans cette
-- migration. Le rattachement d'un colis à un lot est une opération de
-- consolidation logistique distincte d'un événement de statut — elle
-- appartiendra à une fonction dédiée non encore spécifiée. Jusqu'à son
-- écriture, lot_id reste NULL pour tous les colis : comportement
-- attendu, pas un bug.
--
-- Limitations connues, explicitement hors scope de cette migration :
--   - p_photo_url n'est pas validé contre le Storage réel (juste non
--     vide/blanc après trim) : une URL arbitraire passe la vérification.
--   - p_location_lat / p_location_lng ne sont pas bornés à des plages
--     géographiques valides.
-- Les deux sont classées comme améliorations défensives possibles, pas
-- comme des trous de Security Core. Elles ne doivent pas être
-- réintroduites implicitement dans une future migration sans décision
-- explicite.

-- ---------------------------------------------------------------------------
-- 1. DROP de l'ancienne signature, avec garde explicite
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure(
    'public.record_shipment_event(uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb)'
  ) is null then
    raise exception 'record_shipment_event(uuid,text,text,text,numeric,numeric,jsonb,text,text,jsonb) introuvable : signature attendue absente de l''état réel (thduksfosaylbjimrgrn, constaté le 2026-08-30). Migration annulée.';
  end if;
end $$;

drop function public.record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
);

-- ---------------------------------------------------------------------------
-- 2. user_roles.transporter_id
-- ---------------------------------------------------------------------------

alter table public.user_roles
  add column transporter_id uuid references public.transporters(id) on delete set null;

create index if not exists idx_user_roles_transporter_id
  on public.user_roles (transporter_id)
  where transporter_id is not null;

-- ---------------------------------------------------------------------------
-- 3. shipments.status — retrait de 'incident' (les incidents restent une
--    entité parallèle, table incidents, jamais un statut du colis)
-- ---------------------------------------------------------------------------

alter table public.shipments
  drop constraint shipments_status_check;

alter table public.shipments
  add constraint shipments_status_check
  check (status = any (array[
    'created', 'dropped_off', 'inspected', 'departed_origin',
    'in_transit_international', 'customs_clearance', 'arrived_destination',
    'at_hub', 'at_pickup_point', 'out_for_delivery', 'delivered', 'cancelled'
  ]));

comment on column public.shipments.current_pickup_point_id is
  'Point relais actuellement responsable du colis (affectation '
  'opérationnelle courante), pas un historique. Mis à NULL quand le '
  'colis quitte la garde d''un point relais (ex. departed_origin). '
  'L''historique complet reste dans shipment_events, jamais ici.';

-- ---------------------------------------------------------------------------
-- 4. Verrouillage des 4 colonnes de claiming — un seul chemin d'écriture
-- ---------------------------------------------------------------------------

revoke update (
  current_pickup_point_id, assigned_transporter_id, lot_id, current_hub_id
) on public.shipments from authenticated;

-- weight_real_kg et dimensions_cm restent en UPDATE direct pour authenticated
-- (inchangé, correction manuelle légitime — pesée/mesure réelle) ;
-- status, delivery_otp, delivered_at ne sont accordés à authenticated sous
-- aucune forme, ni avant ni après cette migration.

comment on policy shipments_ops_update on public.shipments is
  'UPDATE direct autorisé pour admin / agent_point_relais affecté / '
  'transporteur affecté (org). Depuis Migration 1, les colonnes de '
  'claiming (current_pickup_point_id, assigned_transporter_id, lot_id, '
  'current_hub_id) ne sont plus accordées à authenticated : cette policy '
  'ne leur donne donc plus aucun accès pratique à ces colonnes. Seules '
  'weight_real_kg et dimensions_cm restent atteignables en direct ici. '
  'status / delivery_otp / delivered_at ne sont modifiables que via '
  'record_shipment_event() (SECURITY DEFINER).';

-- ---------------------------------------------------------------------------
-- 5. shipment_events.event_type — CHECK, dérivé de la liste de statuts
--    (base vide au moment de cette migration, aucune donnée existante à
--    concilier ; 'created' exclu, il n'est jamais produit par
--    record_shipment_event() — le statut initial est posé à l'INSERT du
--    colis, pas via un événement)
-- ---------------------------------------------------------------------------

alter table public.shipment_events
  add constraint shipment_events_event_type_check
  check (event_type = any (array[
    'dropped_off', 'inspected', 'departed_origin',
    'in_transit_international', 'customs_clearance', 'arrived_destination',
    'at_hub', 'at_pickup_point', 'out_for_delivery', 'delivered', 'cancelled'
  ]));

-- ---------------------------------------------------------------------------
-- 6. Machine à états
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_transition(p_old_status text, p_new_status text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('created','dropped_off'),
      ('dropped_off','inspected'),
      ('inspected','departed_origin'),
      ('departed_origin','in_transit_international'),
      ('in_transit_international','customs_clearance'),
      ('customs_clearance','arrived_destination'),
      ('arrived_destination','at_hub'),
      ('at_hub','at_pickup_point'),
      ('at_pickup_point','out_for_delivery'),
      ('at_pickup_point','delivered'),      -- bypass pilote : out_for_delivery non utilisé
      ('out_for_delivery','delivered'),
      ('created','cancelled'), ('dropped_off','cancelled'), ('inspected','cancelled'),
      ('departed_origin','cancelled'), ('in_transit_international','cancelled'),
      ('customs_clearance','cancelled'), ('arrived_destination','cancelled'),
      ('at_hub','cancelled'), ('at_pickup_point','cancelled'), ('out_for_delivery','cancelled')
      -- pas d'arête depuis 'delivered' (terminal, delivered -> cancelled interdit)
      -- pas d'arête depuis 'cancelled' (terminal)
    ) as t(from_status, to_status)
    where t.from_status = p_old_status and t.to_status = p_new_status
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Matrice rôle × statut, et dérivation d'event_type
-- ---------------------------------------------------------------------------

create or replace function public.is_role_status_allowed(p_role text, p_new_status text)
returns boolean
language sql
stable
set search_path = ''
as $$
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
      ('transporteur','cancelled')
    ) as t(role, new_status)
    where t.role = p_role and t.new_status = p_new_status
  );
  -- admin : court-circuite entièrement cette matrice (voir la fonction
  -- principale), jamais l'OTP, jamais les invariants de chaîne de garde.
$$;

create or replace function public.derive_event_type(p_new_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_new_status;
$$;

-- ---------------------------------------------------------------------------
-- 8. record_shipment_event() — version durcie
-- ---------------------------------------------------------------------------

create or replace function public.record_shipment_event(
  p_shipment_id uuid,
  p_new_status text,
  p_acting_role text default null,
  p_location_text text default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_photo_url text default null,
  p_qr_scan_ref text default null,
  p_otp text default null,
  p_device_info jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  v_clear_pickup_point boolean := false;
begin
  -- AUTH_REQUIRED
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  v_is_admin := public.is_admin(v_actor);

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

-- ---------------------------------------------------------------------------
-- 9. Verrouillage EXECUTE de la nouvelle signature
--    (même correctif que security_hardening : anon explicite, pas
--    seulement public — voir 20260830140000_security_hardening.sql)
-- ---------------------------------------------------------------------------

revoke execute on function public.record_shipment_event(
  uuid, text, text, text, numeric, numeric, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.record_shipment_event(
  uuid, text, text, text, numeric, numeric, text, text, text, jsonb, jsonb
) to authenticated;

-- is_valid_transition / is_role_status_allowed / derive_event_type :
-- pures, stable/immutable, aucun accès table sensible, pas SECURITY
-- DEFINER — laissées à l'ACL par défaut. is_admin() et handle_new_user() :
-- non touchées par cette migration.
