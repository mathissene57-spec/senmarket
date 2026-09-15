do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_lookup_shipment'
    and prosrc ilike '%at_hub%'
  ) then
    raise exception 'PREFLIGHT FAILED: agent_lookup_shipment gère déjà at_hub';
  end if;
end;
$preflight$;

-- Corrige un trou fonctionnel découvert en construisant l'écran manquant
-- pour la transition at_hub -> at_pickup_point : cette transition est déjà
-- autorisée côté record_shipment_event (is_role_status_allowed accorde
-- 'agent_point_relais' -> 'at_pickup_point'), mais agent_lookup_shipment
-- (utilisé par l'écran pour retrouver le colis avant d'agir) ne renvoyait
-- jamais un colis à l'état 'at_hub' : sa clause de portée (migration
-- 20260912190000) ne couvrait que 'created' (premier dépôt, pas encore
-- réclamé) ou current_pickup_point_id = celui de l'agent (déjà à son
-- point relais). Un colis 'at_hub' n'a ni l'un ni l'autre : la recherche
-- renvoyait 0 ligne, rendant la réception au point relais destination
-- impossible à réaliser dans l'UI malgré un backend qui l'autorise.
--
-- 'at_hub' reçoit le même traitement que 'created' plutôt qu'un nouveau
-- filtre par hub_id : dans les deux cas, le colis est physiquement remis
-- à l'agent au moment de la recherche (dépôt initial par le client, ou
-- transfert depuis le hub) — connaître le code de suivi et avoir le colis
-- en main est le même signal de confiance déjà accepté pour 'created'.
-- Ça reste strictement plus étroit que l'ancien bug corrigé par
-- 20260912190000 (qui exposait tout colis en transit, quel que soit son
-- état, à n'importe quel agent) : seul l'état 'at_hub' est concerné, pas
-- 'in_transit_international'/'customs_clearance'/'arrived_destination'/
-- 'out_for_delivery', qui restent hors de portée d'un agent point relais.
CREATE OR REPLACE FUNCTION public.agent_lookup_shipment(p_tracking_code text, p_acting_role text)
 RETURNS TABLE(
   id uuid, tracking_code text, status text,
   sender_name text, sender_phone text,
   recipient_name text, recipient_phone text,
   origin_city text, destination_city text,
   current_pickup_point_id uuid, current_hub_id uuid, assigned_transporter_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_actor_ur public.user_roles%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  if p_acting_role is null or p_acting_role <> 'agent_point_relais' then
    raise exception 'p_acting_role doit être ''agent_point_relais''';
  end if;

  begin
    select * into strict v_actor_ur
    from public.user_roles
    where user_id = v_actor and role = 'agent_point_relais';
  exception
    when no_data_found then
      raise exception 'rôle agent_point_relais non détenu par cet utilisateur';
    when too_many_rows then
      raise exception 'affiliation ambiguë pour le rôle agent_point_relais (plusieurs affectations) — non supporté en v1.0';
  end;

  if v_actor_ur.pickup_point_id is null then
    raise exception 'agent sans point relais affecté';
  end if;

  return query
  select s.id, s.tracking_code, s.status, s.sender_name, s.sender_phone,
         s.recipient_name, s.recipient_phone, s.origin_city, s.destination_city,
         s.current_pickup_point_id, s.current_hub_id, s.assigned_transporter_id
  from public.shipments s
  where s.tracking_code = p_tracking_code
    and (
      s.status in ('created', 'at_hub')
      or s.current_pickup_point_id = v_actor_ur.pickup_point_id
    );
end;
$function$;
