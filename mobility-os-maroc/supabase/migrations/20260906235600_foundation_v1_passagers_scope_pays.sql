-- FOUNDATION V1 -- etape 7 (validee, apres verification prealable) :
-- scoping de passagers par pays.
--
-- passagers.telephone etait UNIQUE globalement (tous operateurs/pays
-- confondus) -- identifie des le premier audit comme LE seul changement
-- non-additif de tout Foundation V1, et le risque le plus structurant :
-- reserver depuis un operateur ecrasait silencieusement le nom vu par un
-- autre, et un futur second pays partageant un format de numero local
-- aurait pu entrer en collision avec un numero marocain existant.
--
-- Verifie avant migration : select telephone, count(*) from passagers
-- group by telephone having count(*) > 1 -- AUCUN doublon (11 passagers
-- reels au total). Migration sans risque de perte de donnees.
--
-- Portee volontairement limitee : seul creer_course() (point d'entree qui
-- cree/retrouve un passager) est mis a jour pour ecrire country_id. Les
-- autres RPC qui retrouvent un passager par telephone seul
-- (historique_passager, obtenir_contact_course, envoyer_message_course,
-- passager_terminer_course, annuler_course, rechercher_mes_commandes...)
-- restent scopees par telephone uniquement -- inoffensif tant qu'un seul
-- pays est actif (une seule ligne possible par telephone dans les faits
-- aujourd'hui), mais deviendra un vrai chantier a part entiere avant qu'un
-- second pays ne devienne reellement actif. NE PAS considerer ce point
-- comme resolu par cette migration.

alter table public.passagers add column country_id uuid references public.countries(id);

update public.passagers set country_id = (select id from public.countries where code = 'MA') where country_id is null;

alter table public.passagers alter column country_id set not null;

alter table public.passagers drop constraint passagers_telephone_key;
alter table public.passagers add constraint passagers_country_telephone_key unique (country_id, telephone);

create index idx_passagers_country_id on public.passagers(country_id);

-- creer_course() resout desormais le pays depuis l'operateur et l'ecrit
-- sur le passager cree/retrouve. Echec explicite (plutot que corruption
-- silencieuse d'identite) si un operateur n'a pas de country_id -- aucun
-- des 3 operateurs reels n'est concerne (tous backfilles vers MA en
-- etape 2), mais un futur operateur cree sans pays configure doit
-- bloquer proprement plutot que dupliquer une identite passager.
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

    select t.prix into v_prix
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
    type_vehicule, type_course, trajet_interville_id
  )
  values (
    p_operateur_id, v_passager_id, p_adresse_depart, p_adresse_arrivee, v_prix, v_distance_km,
    p_depart_lat, p_depart_lng, p_arrivee_lat, p_arrivee_lng, 'en_recherche',
    p_type_vehicule, p_type_course, p_trajet_interville_id
  )
  returning public.courses.id into v_course_id;

  return query select v_course_id, v_prix, v_distance_km;
end;
$function$;
