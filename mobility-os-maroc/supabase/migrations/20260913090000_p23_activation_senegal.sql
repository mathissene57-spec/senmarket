-- P23 : activation reelle du Senegal, sur demande explicite du client
-- ("Connecte le Senegal") -- portee choisie parmi plusieurs options :
-- activer le pays ET corriger l'inscription self-service pour qu'un
-- operateur puisse effectivement naitre au Senegal, plutot qu'un simple
-- flag sans effet utilisateur.
--
-- Deux bugs decouverts au passage, corriges ici car ils bloquent
-- directement l'objectif (un operateur senegalais fonctionnel de bout
-- en bout), pas des ameliorations hors-sujet :
--
-- 1. creer_mon_operateur() (RPC d'auto-inscription, /onboarding) ne
--    fixait JAMAIS operateurs.country_id -- tout operateur cree en
--    self-service naissait avec country_id = null, donc incapable de
--    jamais creer de course (creer_course leve "Operateur non configure
--    (pays manquant)"). Deja constate en direct sur un operateur
--    existant ("Aftu", cree le 06/09, country_id = null) -- laisse tel
--    quel ici (pas dans le perimetre valide par le client), mais tout
--    NOUVEL operateur auto-inscrit obtient desormais un pays.
-- 2. creer_course() n'ecrivait jamais courses.currency -- la colonne ne
--    prenait donc jamais que sa valeur par defaut ('MAD'), y compris
--    pour un operateur dont la zone tarifaire est en XOF. Une course
--    senegalaise se serait affichee "en MAD" partout (P2 currency
--    display). Corrige en propageant la devise de la zone/du trajet
--    (deja portee par zones_operateur.currency /
--    trajets_intervilles.currency depuis Foundation V1) jusqu'a la
--    course, au lieu de laisser le defaut de colonne agir silencieusement.

update public.countries set is_active = true where code = 'SN';

insert into public.payment_methods (country_id, code, label, is_active)
select id, 'cash', 'Especes', true from public.countries where code = 'SN'
on conflict do nothing;

create or replace function public.creer_mon_operateur(
  p_nom text, p_slug text, p_ville text,
  p_couleur_primaire text, p_couleur_secondaire text,
  p_zone_nom text, p_zone_tarif_base numeric, p_zone_tarif_km numeric,
  p_pays_code text default 'MA'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_operateur_id uuid;
  v_country_id uuid;
  v_devise text;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;
  if p_nom is null or length(trim(p_nom)) = 0 then
    raise exception 'Nom requis';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Slug invalide : lettres minuscules, chiffres et tirets uniquement';
  end if;
  if p_zone_nom is null or length(trim(p_zone_nom)) = 0
     or p_zone_tarif_base is null or p_zone_tarif_km is null
     or p_zone_tarif_base < 0 or p_zone_tarif_km < 0 then
    raise exception 'Zone tarifaire initiale invalide';
  end if;
  if exists (select 1 from public.operateurs where slug = p_slug) then
    raise exception 'Ce slug est deja pris, choisissez-en un autre';
  end if;

  select id, currency into v_country_id, v_devise
  from public.countries
  where code = upper(trim(coalesce(p_pays_code, 'MA'))) and is_active = true;

  if v_country_id is null then
    raise exception 'Pays invalide ou non disponible';
  end if;

  insert into public.operateurs (owner_user_id, nom, slug, ville, couleur_primaire, couleur_secondaire, actif, country_id)
  values (v_uid, trim(p_nom), p_slug, nullif(trim(p_ville), ''), coalesce(nullif(p_couleur_primaire, ''), '#101B3D'), coalesce(nullif(p_couleur_secondaire, ''), '#FF7A28'), true, v_country_id)
  returning id into v_operateur_id;

  insert into public.zones_operateur (operateur_id, nom, tarif_base, tarif_km, currency)
  values (v_operateur_id, trim(p_zone_nom), p_zone_tarif_base, p_zone_tarif_km, v_devise);

  return v_operateur_id;
end;
$function$;

create or replace function public.creer_course(p_operateur_id uuid, p_telephone text, p_nom text, p_adresse_depart text, p_adresse_arrivee text, p_zone_id uuid, p_depart_lat numeric, p_depart_lng numeric, p_arrivee_lat numeric, p_arrivee_lng numeric, p_type_vehicule text DEFAULT 'voiture'::text, p_type_course text DEFAULT 'ville'::text, p_trajet_interville_id uuid DEFAULT NULL::uuid)
returns table(id uuid, prix_estime numeric, distance_km numeric)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_passager_id uuid;
  v_course_id uuid;
  v_tarif_base numeric;
  v_tarif_km numeric;
  v_distance_km numeric;
  v_prix numeric;
  v_country_id uuid;
  v_devise text;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  if p_telephone is null or length(trim(p_telephone)) = 0 then
    raise exception 'Telephone requis';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  select o.country_id into v_country_id from public.operateurs o where o.id = p_operateur_id;
  if v_country_id is null then
    raise exception 'Operateur non configure (pays manquant)';
  end if;

  if p_adresse_depart is null or p_adresse_arrivee is null then
    raise exception 'Depart et arrivee requis';
  end if;

  if p_type_vehicule not in ('voiture', 'moto') then
    raise exception 'Type de vehicule invalide';
  end if;
  if p_type_course not in ('ville', 'intervilles') then
    raise exception 'Type de course invalide';
  end if;

  if p_type_course = 'intervilles' then
    if p_trajet_interville_id is null then
      raise exception 'Trajet intervilles requis';
    end if;

    select t.prix, t.currency into v_prix, v_devise
    from public.trajets_intervilles t
    where t.id = p_trajet_interville_id
      and t.operateur_id = p_operateur_id
      and t.actif = true;

    if v_prix is null then
      raise exception 'Trajet intervilles invalide pour cet operateur';
    end if;

    v_distance_km := null;
  else
    if p_depart_lat is null or p_depart_lng is null or p_arrivee_lat is null or p_arrivee_lng is null
       or abs(p_depart_lat) > 90 or abs(p_arrivee_lat) > 90
       or abs(p_depart_lng) > 180 or abs(p_arrivee_lng) > 180 then
      raise exception 'Coordonnees invalides';
    end if;

    select z.tarif_base, z.tarif_km, z.currency into v_tarif_base, v_tarif_km, v_devise
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
    if p_type_vehicule = 'moto' then
      v_prix := round(v_prix * 0.65, 2);
    end if;
  end if;

  insert into public.passagers (telephone, nom, country_id)
  values (trim(p_telephone), nullif(trim(p_nom), ''), v_country_id)
  on conflict (country_id, telephone) do update set nom = coalesce(excluded.nom, public.passagers.nom)
  returning public.passagers.id into v_passager_id;

  if exists (
    select 1 from public.courses c
    where c.passager_id = v_passager_id
      and c.statut in ('en_recherche', 'assignee', 'en_cours')
  ) then
    raise exception 'Vous avez deja une course active. Terminez-la ou annulez-la avant d''en creer une nouvelle.';
  end if;

  insert into public.courses (
    operateur_id, passager_id, adresse_depart, adresse_arrivee, prix_estime, distance_km,
    depart_lat, depart_lng, arrivee_lat, arrivee_lng, statut,
    type_vehicule, type_course, trajet_interville_id, currency
  )
  values (
    p_operateur_id, v_passager_id, p_adresse_depart, p_adresse_arrivee, v_prix, v_distance_km,
    p_depart_lat, p_depart_lng, p_arrivee_lat, p_arrivee_lng, 'en_recherche',
    p_type_vehicule, p_type_course, p_trajet_interville_id, coalesce(v_devise, 'MAD')
  )
  returning public.courses.id into v_course_id;

  return query select v_course_id, v_prix, v_distance_km;
end;
$function$;
