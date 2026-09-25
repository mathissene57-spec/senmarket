-- SenLink — P0.1 : retrait de delivery_otp du tracking public
--
-- Constat (audit du 15/09/2026) : get_public_tracking(p_tracking_code), appelable par
-- n'importe qui sans authentification via la page /suivi publique, renvoyait
-- delivery_otp tant que le colis était 'at_pickup_point'. L'OTP sert précisément à
-- vérifier que la personne qui retire le colis au point relais est bien le
-- destinataire (validé par record_shipment_event via p_otp) -- l'exposer dans le même
-- canal public qui sert à obtenir le code de suivi annule cette garantie : quiconque
-- connaît le code de suivi pouvait lire l'OTP directement, sans jamais l'avoir reçu du
-- vrai destinataire.
--
-- Portée strictement limitée à ce retrait : le mécanisme de génération de l'OTP
-- (record_shipment_event, colonne shipments.delivery_otp) n'est PAS modifié, pour
-- permettre plus tard un canal de notification réel (SMS/WhatsApp) qui transmettrait
-- l'OTP au destinataire hors de ce endpoint public. Pour le pilote actuel (sans ce
-- canal), le tracking public reste fonctionnel pour toutes les informations non
-- sensibles ; l'OTP n'est simplement plus disponible que par la voie interne
-- (shipments.delivery_otp, lu par record_shipment_event lors du retrait).
--
-- DROP requis : le type de retour change (colonne retirée).

do $preflight$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_tracking'
    and pg_get_function_result(p.oid) ilike '%delivery_otp%'
  ) then
    raise exception 'PREFLIGHT FAILED: get_public_tracking n''expose déjà plus delivery_otp -- rien à faire';
  end if;
end;
$preflight$;

drop function public.get_public_tracking(text);

create function public.get_public_tracking(p_tracking_code text)
 returns table(tracking_code text, status text, origin_city text, destination_city text, created_at timestamp with time zone, event_type text, event_location text, event_created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    s.tracking_code, s.status, s.origin_city, s.destination_city, s.created_at,
    e.event_type, e.location_text, e.created_at
  from public.shipments s
  left join public.shipment_events e on e.shipment_id = s.id
  where s.tracking_code = p_tracking_code
  order by e.created_at asc;
$function$;

grant execute on function public.get_public_tracking(text) to anon, authenticated;
