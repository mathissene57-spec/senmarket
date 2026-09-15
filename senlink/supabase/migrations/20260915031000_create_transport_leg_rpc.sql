-- SenLink — P0.2 : activation sécurisée de transport_legs
--
-- Constat (audit du 15/09/2026) : transport_legs (Logistics Core, étape 10/12) n'a
-- qu'une policy RLS SELECT (transport_legs_select) -- aucune policy INSERT/UPDATE/
-- DELETE, et aucune des RPC d'écriture Logistics Core existantes (register_container,
-- record_container_event, link_shipment_container) n'y écrit. Résultat : personne, pas
-- même un admin, ne pouvait créer un transport_leg via l'application ou l'API REST.
--
-- Portée strictement limitée à la création (INSERT). Aucune policy INSERT publique
-- n'est ajoutée -- le pattern reste identique aux trois RPC sœurs de l'étape 11 :
-- écriture exclusivement via une fonction SECURITY DEFINER admin-gated, table
-- inatteignable en écriture directe (confirmé par test : un INSERT direct échoue par
-- absence de policy RLS correspondante, y compris pour un admin).
--
-- Mêmes conventions que register_container/record_container_event/
-- link_shipment_container : is_admin() (aucun nouveau système de permission),
-- SECURITY DEFINER + search_path='', revoke public/anon puis grant authenticated
-- seul. Pas de RPC de transition de statut (planned -> in_progress -> ...) ici --
-- hors périmètre de ce chantier P0, à traiter séparément si un besoin réel apparaît.
--
-- organization_id est dérivé automatiquement de l'entité référencée (shipments.
-- organization_id ou containers.organization_id), jamais choisi par l'appelant --
-- même logique que derive_shipment_organization()/derive_lot_organization() : un leg
-- ne peut pas être rattaché à une organisation différente de celle de son colis/
-- conteneur.

do $preflight$
begin
  if exists (select 1 from pg_proc where proname = 'create_transport_leg' and pronamespace = 'public'::regnamespace) then
    raise exception 'PREFLIGHT FAILED: create_transport_leg existe déjà';
  end if;
end;
$preflight$;

create function public.create_transport_leg(
  p_transport_mode text,
  p_origin_label text,
  p_destination_label text,
  p_shipment_id uuid default null,
  p_container_id uuid default null,
  p_leg_order smallint default 1,
  p_origin_port_id text default null,
  p_destination_port_id text default null,
  p_origin_hub_id uuid default null,
  p_destination_hub_id uuid default null,
  p_planned_departure timestamptz default null,
  p_planned_arrival timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_organization_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;

  if (p_shipment_id is null) = (p_container_id is null) then
    raise exception 'exactement un de p_shipment_id ou p_container_id doit être renseigné';
  end if;

  if p_shipment_id is not null then
    select organization_id into v_organization_id from public.shipments where id = p_shipment_id;
    if not found then
      raise exception 'colis introuvable';
    end if;
  else
    select organization_id into v_organization_id from public.containers where id = p_container_id;
    if not found then
      raise exception 'conteneur introuvable';
    end if;
  end if;

  insert into public.transport_legs (
    shipment_id, container_id, leg_order, transport_mode,
    origin_label, destination_label, origin_port_id, destination_port_id,
    origin_hub_id, destination_hub_id, planned_departure, planned_arrival,
    organization_id
  ) values (
    p_shipment_id, p_container_id, p_leg_order, p_transport_mode,
    p_origin_label, p_destination_label, p_origin_port_id, p_destination_port_id,
    p_origin_hub_id, p_destination_hub_id, p_planned_departure, p_planned_arrival,
    v_organization_id
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.create_transport_leg(text,text,text,uuid,uuid,smallint,text,text,uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.create_transport_leg(text,text,text,uuid,uuid,smallint,text,text,uuid,uuid,timestamptz,timestamptz) to authenticated;
