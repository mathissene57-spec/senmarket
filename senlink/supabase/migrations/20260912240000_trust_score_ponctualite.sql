do $preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'recalculer_trust_score_transporteur'
  ) then
    raise exception 'PREFLIGHT FAILED: recalculer_trust_score_transporteur existe déjà';
  end if;
end;
$preflight$;

-- Trust Score v1.0 : décision produit prise avec l'utilisateur — un seul
-- facteur pour l'instant, la ponctualité au sens large (retards/incidents
-- déclarés), pas de volume ni d'autre pondération. Formule : pourcentage de
-- colis gérés par ce transporteur qui n'ont reçu AUCUN incident, quel que
-- soit le type (colis_endommage, colis_manquant, retard,
-- probleme_douanier, mauvaise_adresse, destinataire_absent, autre) —
-- "gérés" = shipments.assigned_transporter_id = ce transporteur
-- actuellement (simplification v1.0 : pas d'historique des
-- réaffectations). NULL tant qu'aucun colis n'a jamais été géré (un score
-- de 100 sur zéro colis serait trompeur, pas "aucun problème constaté").
CREATE FUNCTION public.recalculer_trust_score_transporteur(p_transporter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_total int;
  v_avec_incident int;
begin
  select count(*) into v_total
  from public.shipments s
  where s.assigned_transporter_id = p_transporter_id;

  if v_total = 0 then
    update public.transporters set trust_score = null where id = p_transporter_id;
    return;
  end if;

  select count(distinct s.id) into v_avec_incident
  from public.shipments s
  join public.incidents i on i.shipment_id = s.id
  where s.assigned_transporter_id = p_transporter_id;

  update public.transporters
  set trust_score = round(100.0 * (v_total - v_avec_incident) / v_total, 1)
  where id = p_transporter_id;
end;
$function$;

-- Recalcule à chaque affectation/réaffectation de colis (l'ancien
-- transporteur, s'il change, perd aussi ce colis de son décompte).
CREATE FUNCTION public.trg_recalc_trust_score_on_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if new.assigned_transporter_id is not null then
    perform public.recalculer_trust_score_transporteur(new.assigned_transporter_id);
  end if;
  if TG_OP = 'UPDATE' and old.assigned_transporter_id is not null
     and old.assigned_transporter_id is distinct from new.assigned_transporter_id then
    perform public.recalculer_trust_score_transporteur(old.assigned_transporter_id);
  end if;
  return new;
end;
$function$;

CREATE TRIGGER trg_recalc_trust_score_on_shipment
AFTER INSERT OR UPDATE OF assigned_transporter_id ON public.shipments
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_trust_score_on_shipment();

-- Recalcule à chaque incident déclaré sur un colis déjà affecté à un transporteur.
CREATE FUNCTION public.trg_recalc_trust_score_on_incident()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_transporter_id uuid;
begin
  select assigned_transporter_id into v_transporter_id
  from public.shipments where id = new.shipment_id;

  if v_transporter_id is not null then
    perform public.recalculer_trust_score_transporteur(v_transporter_id);
  end if;
  return new;
end;
$function$;

CREATE TRIGGER trg_recalc_trust_score_on_incident
AFTER INSERT ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_trust_score_on_incident();

-- Backfill pour les transporteurs déjà existants (les triggers ne
-- couvrent que les écritures futures).
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.transporters loop
    perform public.recalculer_trust_score_transporteur(v_id);
  end loop;
end $$;
