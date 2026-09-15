-- SenLink — RPC publique de tracking conteneur ("Tracker un conteneur", B3)
--
-- Meme pattern que get_public_tracking (colis) : SECURITY DEFINER, aucune
-- authentification requise, aucun PII expose (containers ne contient ni
-- nom/telephone expediteur/destinataire -- juste des donnees logistiques
-- objectives : numero, type, transporteur, navire, statut, ETA, historique
-- d'evenements). Contourne deliberement containers_org_select (qui exige
-- appartenance a l'organisation) car le produit V1 est explicitement public :
-- "l'utilisateur entre un numero de conteneur, SenLink cherche, SenLink
-- affiche ce qu'il trouve" -- connaitre le numero de conteneur est le seul
-- signal de legitimite requis, comme pour le suivi de colis public.
--
-- event_source ('manual'/'provider'/'system') est retourne explicitement
-- pour que l'interface puisse distinguer une donnee verifiee a la main
-- (le cas aujourd'hui, faute d'acces API fournisseur en attente de
-- validation commerciale) d'une donnee alimentee par un flux fournisseur
-- automatise (une fois branche).

do $preflight$
begin
  if exists (select 1 from pg_proc where proname = 'public_track_container' and pronamespace = 'public'::regnamespace) then
    raise exception 'PREFLIGHT FAILED: public_track_container existe deja';
  end if;
end;
$preflight$;

create function public.public_track_container(p_container_number text)
 returns table(
   container_number text, container_type text, carrier_name text,
   vessel_name text, voyage_number text, current_status text, eta timestamptz,
   event_type text, event_location text, event_time timestamptz, event_source text
 )
 language sql
 stable
 security definer
 set search_path = ''
as $function$
  select
    c.container_number, c.container_type, cp.shipping_line_name,
    c.vessel_name, c.voyage_number, c.current_status, c.eta,
    e.event_type, e.location_text, e.event_time, e.source
  from public.containers c
  left join public.carrier_prefixes cp on cp.prefix = c.carrier_prefix
  left join public.container_events e on e.container_id = c.id
  where c.container_number = upper(trim(p_container_number))
  order by e.event_time asc;
$function$;

grant execute on function public.public_track_container(text) to anon, authenticated;
