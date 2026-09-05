-- P11 : courses intervilles + courses en moto (demande produit, 2026-09-05).
--
-- Deux ajouts independants au modele existant (jusqu'ici : une seule zone
-- tarifaire par ville, un seul type de vehicule implicite "voiture") :
--
-- 1. Type de vehicule par chauffeur (chauffeurs.type_vehicule, 'voiture' ou
--    'moto') et par course (courses.type_vehicule, snapshote a la commande).
--    Le dispatch cote client (app/chauffeur/page.tsx) ne doit montrer a un
--    chauffeur que les courses de SON type de vehicule -- filtrage ajoute
--    cote client, ce fichier ne fait qu'exposer la colonne.
-- 2. Trajets intervilles (nouvelle table trajets_intervilles) : contrairement
--    aux courses "ville" (prix = tarif_base + tarif_km * distance calculee
--    par geocodage), une course intervilles a un prix FIXE par trajet
--    (ville_depart -> ville_arrivee), defini par l'operateur. courses.
--    type_course ('ville' ou 'intervilles') et courses.trajet_interville_id
--    distinguent les deux flux dans la meme table plutot que d'en creer une
--    parallele -- les ecrans de suivi/historique existants (qui lisent
--    courses.adresse_depart/adresse_arrivee/prix_estime) fonctionnent donc
--    sans modification pour les deux types.

create table if not exists public.trajets_intervilles (
  id uuid primary key default gen_random_uuid(),
  operateur_id uuid not null references public.operateurs(id) on delete cascade,
  ville_depart text not null,
  ville_arrivee text not null,
  prix numeric not null check (prix >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.trajets_intervilles enable row level security;

-- Meme patron que zones_operateur : lecture publique (le passager doit
-- pouvoir lister les trajets disponibles avant meme d'etre "connecte"),
-- gestion reservee au proprietaire de l'operateur.
create policy trajets_intervilles_lecture_publique
  on public.trajets_intervilles for select
  using (true);

create policy trajets_intervilles_gestion_insert_owner
  on public.trajets_intervilles for insert
  with check (operateur_id in (
    select id from public.operateurs where owner_user_id = auth.uid()
  ));

create policy trajets_intervilles_gestion_update_owner
  on public.trajets_intervilles for update
  using (operateur_id in (
    select id from public.operateurs where owner_user_id = auth.uid()
  ))
  with check (operateur_id in (
    select id from public.operateurs where owner_user_id = auth.uid()
  ));

create policy trajets_intervilles_gestion_delete_owner
  on public.trajets_intervilles for delete
  using (operateur_id in (
    select id from public.operateurs where owner_user_id = auth.uid()
  ));

grant select on public.trajets_intervilles to anon, authenticated;
grant insert, update, delete on public.trajets_intervilles to authenticated;

-- Type de vehicule par chauffeur --------------------------------------------
alter table public.chauffeurs
  add column if not exists type_vehicule text not null default 'voiture'
    check (type_vehicule in ('voiture', 'moto'));

grant select (type_vehicule) on public.chauffeurs to anon, authenticated;
grant insert (type_vehicule), update (type_vehicule) on public.chauffeurs to authenticated;

-- Type de vehicule / type de course / trajet intervilles sur courses --------
alter table public.courses
  add column if not exists type_vehicule text not null default 'voiture'
    check (type_vehicule in ('voiture', 'moto')),
  add column if not exists type_course text not null default 'ville'
    check (type_course in ('ville', 'intervilles')),
  add column if not exists trajet_interville_id uuid references public.trajets_intervilles(id);

grant select (type_vehicule, type_course, trajet_interville_id) on public.courses to anon, authenticated;

-- creer_course : nouvelle signature (3 parametres optionnels en fin de
-- liste) -- DROP explicite requis avant CREATE, sinon Postgres cree un
-- second overload au lieu de remplacer l'ancien (piege deja rencontre plus
-- tot dans ce chantier).
drop function if exists public.creer_course(uuid, text, text, text, text, uuid, numeric, numeric, numeric, numeric);

create function public.creer_course(
  p_operateur_id uuid,
  p_telephone text,
  p_nom text,
  p_adresse_depart text,
  p_adresse_arrivee text,
  p_zone_id uuid,
  p_depart_lat numeric,
  p_depart_lng numeric,
  p_arrivee_lat numeric,
  p_arrivee_lng numeric,
  p_type_vehicule text default 'voiture',
  p_type_course text default 'ville',
  p_trajet_interville_id uuid default null
)
returns table(id uuid, prix_estime numeric, distance_km numeric)
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
    -- Tarif moto reduit (demande produit : moins cher qu'une voiture en
    -- ville) -- applique uniquement aux courses "ville", un trajet
    -- intervilles a deja un prix fixe defini par l'operateur ci-dessus.
    if p_type_vehicule = 'moto' then
      v_prix := round(v_prix * 0.65, 2);
    end if;
  end if;

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

grant execute on function public.creer_course(
  uuid, text, text, text, text, uuid, numeric, numeric, numeric, numeric, text, text, uuid
) to anon, authenticated;

-- chauffeurs_operateur / courses_operateur / connexion_chauffeur : simple
-- ajout de colonnes de sortie en fin de liste (permis par CREATE OR REPLACE
-- sans DROP -- Postgres n'autorise cet ajout en place QUE lorsque les
-- nouvelles colonnes OUT sont ajoutees strictement a la fin).
create or replace function public.chauffeurs_operateur(p_operateur_id uuid)
returns table(id uuid, operateur_id uuid, nom text, telephone text, vehicule text, plaque text, statut text, note_moyenne numeric, created_at timestamptz, position_lat numeric, position_lng numeric, position_maj_at timestamptz, position_recente boolean, type_vehicule text)
language sql
security definer
set search_path to ''
as $function$
  select
    c.id, c.operateur_id, c.nom, c.telephone, c.vehicule, c.plaque,
    c.statut, c.note_moyenne, c.created_at,
    c.position_lat, c.position_lng, c.position_maj_at,
    (c.position_maj_at is not null and c.position_maj_at > now() - interval '2 minutes') as position_recente,
    c.type_vehicule
  from public.chauffeurs c
  where c.operateur_id = p_operateur_id
    and exists (
      select 1 from public.operateurs o
      where o.id = p_operateur_id and o.owner_user_id = auth.uid()
    )
  order by c.created_at desc;
$function$;

create or replace function public.courses_operateur(p_operateur_id uuid)
returns table(id uuid, operateur_id uuid, passager_id uuid, chauffeur_id uuid, statut text, adresse_depart text, adresse_arrivee text, prix_estime numeric, prix_final numeric, distance_km numeric, depart_lat numeric, depart_lng numeric, arrivee_lat numeric, arrivee_lng numeric, rayon_recherche_km numeric, created_at timestamptz, assignee_at timestamptz, terminee_at timestamptz, bloquee boolean, type_vehicule text, type_course text, trajet_interville_id uuid)
language sql
security definer
set search_path to ''
as $function$
  select
    c.id, c.operateur_id, c.passager_id, c.chauffeur_id, c.statut,
    c.adresse_depart, c.adresse_arrivee, c.prix_estime, c.prix_final,
    c.distance_km, c.depart_lat, c.depart_lng, c.arrivee_lat, c.arrivee_lng,
    c.rayon_recherche_km, c.created_at, c.assignee_at, c.terminee_at,
    (c.statut = 'assignee' and c.assignee_at is not null and c.assignee_at < now() - interval '20 minutes') as bloquee,
    c.type_vehicule, c.type_course, c.trajet_interville_id
  from public.courses c
  where c.operateur_id = p_operateur_id
    and exists (
      select 1 from public.operateurs o
      where o.id = p_operateur_id and o.owner_user_id = auth.uid()
    )
  order by c.created_at desc;
$function$;

create or replace function public.connexion_chauffeur(p_operateur_id uuid, p_telephone text)
returns table(id uuid, nom text, telephone text, statut text, type_vehicule text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  return query
  select c.id, c.nom, c.telephone, c.statut, c.type_vehicule
  from public.chauffeurs c
  where c.operateur_id = p_operateur_id
    and c.telephone = trim(p_telephone)
  limit 1;
end;
$function$;
