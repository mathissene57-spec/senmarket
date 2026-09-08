do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_lookup_shipment'
  ) then
    raise exception 'PREFLIGHT FAILED: agent_lookup_shipment existe déjà';
  end if;
end;
$preflight$;

-- La policy shipments_client_select ne laisse un agent_point_relais voir
-- un colis que si user_roles.pickup_point_id = shipments.current_pickup_point_id
-- — jamais vrai tant que le colis n'a encore été réclamé par aucun point
-- relais (cas du tout premier dépôt, current_pickup_point_id est NULL), et
-- il n'existe aucune branche RLS du tout pour un agent affecté à un hub
-- (user_roles.hub_id). Plutôt que d'élargir une policy déjà auditée et
-- verrouillée, cette RPC couvre le seul besoin réel : un agent qui connaît
-- déjà un code de suivi (remis en main propre par l'expéditeur/le
-- transporteur) doit pouvoir le retrouver pour agir dessus. Même modèle de
-- confiance que get_public_tracking (connaître le code suffit), restreint
-- en plus à un compte authentifié détenant réellement le rôle.
CREATE FUNCTION public.agent_lookup_shipment(p_tracking_code text, p_acting_role text)
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
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'authentification requise';
  end if;
  if p_acting_role is null or p_acting_role <> 'agent_point_relais' then
    raise exception 'p_acting_role doit être ''agent_point_relais''';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = v_actor and role = 'agent_point_relais'
  ) then
    raise exception 'rôle agent_point_relais non détenu par cet utilisateur';
  end if;

  return query
  select s.id, s.tracking_code, s.status, s.sender_name, s.sender_phone,
         s.recipient_name, s.recipient_phone, s.origin_city, s.destination_city,
         s.current_pickup_point_id, s.current_hub_id, s.assigned_transporter_id
  from public.shipments s
  where s.tracking_code = p_tracking_code;
end;
$function$;

grant execute on function public.agent_lookup_shipment(text, text) to authenticated;
