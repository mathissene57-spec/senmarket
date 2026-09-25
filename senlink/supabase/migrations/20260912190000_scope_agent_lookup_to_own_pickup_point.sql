do $preflight$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_lookup_shipment'
  ) then
    raise exception 'PREFLIGHT FAILED: agent_lookup_shipment n''existe pas';
  end if;
end;
$preflight$;

-- Corrige une fuite de PII : la version d'origine (migration
-- 20260908101500) renvoyait sender_name/sender_phone/recipient_name/
-- recipient_phone pour N'IMPORTE QUEL code de suivi à N'IMPORTE QUEL
-- agent_point_relais du réseau, sans vérifier que le colis a le moindre
-- rapport avec son propre point relais. Son commentaire la justifiait comme
-- "même modèle de confiance que get_public_tracking (connaître le code
-- suffit)" — mais get_public_tracking ne renvoie aucun PII, donc l'analogie
-- était fausse : les deux fonctions n'exposaient pas la même classe de
-- données. record_shipment_event, lui, applique déjà la bonne portée côté
-- écriture ("colis déjà affecté à un autre point relais" /
-- "colis non affecté à ce point relais") — cette migration aligne la
-- lecture sur la même règle : un agent ne voit le PII complet que si le
-- colis est encore à l'état 'created' (tout premier dépôt, pas encore
-- réclamé par un point relais) ou s'il est déjà affecté au sien. Filtrer
-- sur current_pickup_point_id IS NULL au lieu du statut aurait été
-- insuffisant : ce champ est aussi remis à NULL dès departed_origin (donc
-- pendant tout le transit international, at_hub, out_for_delivery...), ce
-- qui aurait laissé n'importe quel agent lire le PII d'un colis en transit
-- n'ayant plus aucun rapport avec un point relais. Un code hors de sa
-- portée renvoie simplement 0 ligne (comme "code inconnu"), sans révéler
-- que le colis existe ailleurs.
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
      s.status = 'created'
      or s.current_pickup_point_id = v_actor_ur.pickup_point_id
    );
end;
$function$;

grant execute on function public.agent_lookup_shipment(text, text) to authenticated;
