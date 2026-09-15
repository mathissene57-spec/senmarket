do $preflight$
begin
  if exists (
    select 1 from pg_trigger where tgname = 'trg_notify_client_on_shipment_event'
  ) then
    raise exception 'PREFLIGHT FAILED: trg_notify_client_on_shipment_event existe déjà';
  end if;
end;
$preflight$;

-- La table notifications existait déjà (channel/type/message/status) et la
-- page /dashboard/client/notifications la lit depuis longtemps, mais rien
-- n'y écrivait jamais nulle part dans le code — elle restait vide en
-- permanence (0 ligne en base). WhatsApp/SMS restent hors périmètre (pas
-- d'intégration Twilio/WhatsApp Cloud API, cf. commentaire de la migration
-- delivery_otp_generation), mais notifications.channel accepte déjà la
-- valeur 'in_app', qui ne nécessite aucune intégration externe : c'est la
-- seule chose branchée ici. Chaque événement de shipment_events (donc
-- chaque transition de statut déjà validée par record_shipment_event)
-- déclenche une notification 'in_app' pour le client propriétaire du
-- colis. status='sent'/sent_at=now() directement : une notification
-- in_app est "délivrée" dès que la ligne existe et que RLS autorise sa
-- lecture, il n'y a pas de file d'envoi asynchrone à modéliser ici.
CREATE OR REPLACE FUNCTION public.notify_client_on_shipment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_client_user_id uuid;
  v_tracking_code text;
  v_label text;
begin
  select client_user_id, tracking_code into v_client_user_id, v_tracking_code
  from public.shipments
  where id = new.shipment_id;

  -- Pas de compte client à notifier (architecture guest possible côté
  -- schéma : client_user_id est nullable).
  if v_client_user_id is null then
    return new;
  end if;

  v_label := case new.new_status
    when 'created' then 'Créé'
    when 'dropped_off' then 'Déposé au point relais'
    when 'inspected' then 'Contrôlé'
    when 'departed_origin' then 'Départ'
    when 'in_transit_international' then 'Transit international'
    when 'customs_clearance' then 'Contrôle douanier'
    when 'arrived_destination' then 'Arrivé à destination'
    when 'at_hub' then 'Au hub'
    when 'at_pickup_point' then 'Au point relais'
    when 'out_for_delivery' then 'En cours de livraison'
    when 'delivered' then 'Livré'
    when 'incident' then 'Incident'
    when 'cancelled' then 'Annulé'
    else new.new_status
  end;

  insert into public.notifications (user_id, shipment_id, channel, type, message, status, sent_at)
  values (
    v_client_user_id,
    new.shipment_id,
    'in_app',
    'shipment_status_update',
    format('Colis %s : %s', v_tracking_code, v_label),
    'sent',
    now()
  );

  return new;
end;
$function$;

CREATE TRIGGER trg_notify_client_on_shipment_event
AFTER INSERT ON public.shipment_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_client_on_shipment_event();
