-- P2 (H-3, plan de finalisation V1) : empeche un meme numero de passager de
-- creer plusieurs courses actives simultanement. Sans cette limite,
-- creer_course pouvait etre appele en boucle par un numero (meme legitimement
-- verifie) et chaque insertion en_recherche declenche notifier_nouvelle_course
-- qui notifie TOUS les chauffeurs disponibles de l'operateur -- un
-- amplificateur direct pour spammer une flotte entiere de notifications.
--
-- Objectif minimum V1 (cf. plan) : un passager ne peut avoir qu'UNE course
-- active (en_recherche/assignee/en_cours) a la fois, tous operateurs
-- confondus (passagers.telephone est deja une identite globale sur la
-- plateforme, pas scopee par operateur). Une fois la course terminee ou
-- annulee, une nouvelle peut etre creee immediatement.
create or replace function public.creer_course(p_operateur_id uuid, p_telephone text, p_nom text, p_adresse_depart text, p_adresse_arrivee text, p_zone_id uuid, p_depart_lat numeric, p_depart_lng numeric, p_arrivee_lat numeric, p_arrivee_lng numeric)
 returns TABLE(id uuid, prix_estime numeric, distance_km numeric)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_passager_id uuid;
  v_course_id uuid;
  v_tarif_base numeric;
  v_tarif_km numeric;
  v_distance_km numeric;
  v_prix numeric;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  if p_telephone is null or length(trim(p_telephone)) = 0 then
    raise exception 'Telephone requis';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if p_adresse_depart is null or p_adresse_arrivee is null then
    raise exception 'Depart et arrivee requis';
  end if;
  if p_depart_lat is null or p_depart_lng is null or p_arrivee_lat is null or p_arrivee_lng is null
     or abs(p_depart_lat) > 90 or abs(p_arrivee_lat) > 90
     or abs(p_depart_lng) > 180 or abs(p_arrivee_lng) > 180 then
    raise exception 'Coordonnees invalides';
  end if;

  select z.tarif_base, z.tarif_km into v_tarif_base, v_tarif_km
  from public.zones_operateur z
  where z.id = p_zone_id and z.operateur_id = p_operateur_id;

  if v_tarif_base is null then
    raise exception 'Zone tarifaire invalide pour cet operateur';
  end if;

  v_distance_km := 6371 * acos(
    greatest(-1, least(1,
      cos(radians(p_depart_lat)) * cos(radians(p_arrivee_lat)) * cos(radians(p_arrivee_lng) - radians(p_depart_lng))
      + sin(radians(p_depart_lat)) * sin(radians(p_arrivee_lat))
    ))
  );
  v_distance_km := greatest(v_distance_km, 0.3);
  if v_distance_km > 200 then
    raise exception 'Distance hors zone de service (% km)', round(v_distance_km, 1);
  end if;

  v_prix := round((v_tarif_base + v_tarif_km * v_distance_km)::numeric, 2);

  insert into public.passagers (telephone, nom)
  values (trim(p_telephone), nullif(trim(p_nom), ''))
  on conflict (telephone) do update set nom = coalesce(excluded.nom, public.passagers.nom)
  returning public.passagers.id into v_passager_id;

  if exists (
    select 1 from public.courses c
    where c.passager_id = v_passager_id
      and c.statut in ('en_recherche', 'assignee', 'en_cours')
  ) then
    raise exception 'Vous avez deja une course active. Terminez-la ou annulez-la avant d''en creer une nouvelle.';
  end if;

  insert into public.courses (operateur_id, passager_id, adresse_depart, adresse_arrivee, prix_estime, distance_km, depart_lat, depart_lng, arrivee_lat, arrivee_lng, statut)
  values (p_operateur_id, v_passager_id, p_adresse_depart, p_adresse_arrivee, v_prix, v_distance_km, p_depart_lat, p_depart_lng, p_arrivee_lat, p_arrivee_lng, 'en_recherche')
  returning public.courses.id into v_course_id;

  return query select v_course_id, v_prix, v_distance_km;
end;
$function$;
