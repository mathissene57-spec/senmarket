-- SenLink — backlog P1 : restreint la visibilité 'at_hub' d'agent_lookup_shipment au hub de l'agent
--
-- Constat (audit du 15/09/2026) : depuis la migration scope_agent_lookup_include_at_hub
-- (20260912260000), un agent_point_relais authentifié pouvait consulter le PII complet
-- (nom/téléphone expéditeur+destinataire) de N'IMPORTE QUEL colis 'at_hub', quel que soit
-- le hub où ce colis se trouve réellement -- pas seulement celui où l'agent est affecté
-- (user_roles.hub_id). Relecture des commentaires des migrations 20260912190000 et
-- 20260912260000 : ce n'est pas un oubli -- le principe assumé ("avoir le colis en main +
-- connaître le code de suivi" comme signal de confiance) est documenté et réfléchi. Mais
-- rien n'imposait que ce hub soit RÉELLEMENT celui de l'agent, alors que
-- record_shipment_event exige déjà explicitement cette correspondance pour la transition
-- elle-même (agent sans hub_id affecté ou hub_id ≠ current_hub_id -> rejeté). Cette
-- migration aligne la lecture (agent_lookup_shipment) sur la même règle déjà appliquée en
-- écriture : un agent ne voit un colis 'at_hub' que si current_hub_id = son propre hub_id.
--
-- 'created' reste réseau-entier, INCHANGÉ : un client peut se présenter à n'importe quel
-- point relais pour un premier dépôt, ce cas ne peut pas être restreint par hub/point sans
-- changer le modèle (cf. commentaire de 20260912190000). Seule la branche 'at_hub' est
-- resserrée ici. Testé en transaction annulée avant application : un agent dont le hub
-- correspond au colis le voit (1 ligne), le même agent déplacé sur un autre hub ne le voit
-- plus (0 ligne), et 'created' reste visible quel que soit le hub de l'agent (1 ligne) --
-- aucune régression sur le reste de la fonction (auth, rôle, affiliation, point relais
-- propre).

do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_lookup_shipment'
    and prosrc ilike '%current_hub_id = v_actor_ur.hub_id%'
  ) then
    raise exception 'PREFLIGHT FAILED: agent_lookup_shipment scope déjà at_hub par hub_id';
  end if;
end;
$preflight$;

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
      or (s.status = 'at_hub' and s.current_hub_id = v_actor_ur.hub_id)
      or s.current_pickup_point_id = v_actor_ur.pickup_point_id
    );
end;
$function$;
