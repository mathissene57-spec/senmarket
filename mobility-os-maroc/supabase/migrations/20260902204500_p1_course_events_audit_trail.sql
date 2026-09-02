-- P1 : table d'evenements/audit trail pour reconstruire le fil d'une course
-- (observabilite + diagnostic, cf. audit Phase 0 §3/§7 -- "aucune
-- observabilite, un probleme utilisateur ne peut etre diagnostique qu'en
-- interrogeant manuellement la base"). Purement additif : aucun RPC
-- existant ne change de comportement, seule une ligne "set_config" est
-- ajoutee pour identifier l'acteur de chaque transition.
--
-- Volontairement absent de cette premiere version : les evenements
-- "chauffeur propose"/"chauffeur refuse" (aucune ecriture serveur n'existe
-- aujourd'hui pour un refus, purement local a l'app chauffeur -- necessite
-- une nouvelle RPC + un changement frontend, a decider separement).

create table public.course_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  operateur_id uuid not null references public.operateurs(id) on delete cascade,
  type text not null check (type in ('creee','assignee','en_cours','terminee','annulee','sans_chauffeur','notee')),
  chauffeur_id uuid references public.chauffeurs(id),
  acteur text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index course_events_course_id_idx on public.course_events (course_id, created_at);
create index course_events_operateur_id_idx on public.course_events (operateur_id, created_at);

alter table public.course_events enable row level security;
-- Aucune policy : deny-all par defaut en acces direct (comme otp_codes /
-- admin_plateforme). Seule evenements_course() (SECURITY DEFINER, plus bas)
-- y donne acces, scopee par propriete de l'operateur.

-- Trigger sur courses : capture creation + chaque transition de statut,
-- quel que soit le chemin de code qui la produit (robuste aux futures RPC).
create or replace function public.enregistrer_evenement_course()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur, details)
    values (new.id, new.operateur_id, 'creee', null, current_setting('app.acteur', true), jsonb_build_object('prix_estime', new.prix_estime));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.statut is distinct from old.statut then
    insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur, details)
    values (new.id, new.operateur_id, new.statut, new.chauffeur_id, current_setting('app.acteur', true), jsonb_build_object('statut_precedent', old.statut));
  end if;

  return new;
end;
$function$;

create trigger trg_enregistrer_evenement_course
after insert or update of statut on public.courses
for each row execute function public.enregistrer_evenement_course();

-- Trigger sur avis_courses : capture la notation (evenement 'notee').
create or replace function public.enregistrer_evenement_notation()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_operateur_id uuid;
  v_chauffeur_id uuid;
begin
  select c.operateur_id, c.chauffeur_id into v_operateur_id, v_chauffeur_id
  from public.courses c where c.id = new.course_id;

  insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur, details)
  values (new.course_id, v_operateur_id, 'notee', v_chauffeur_id, current_setting('app.acteur', true), jsonb_build_object('note', new.note));

  return new;
end;
$function$;

create trigger trg_enregistrer_evenement_notation
after insert on public.avis_courses
for each row execute function public.enregistrer_evenement_notation();

-- Lecture scopee par propriete de l'operateur (meme patron que
-- courses_operateur()/chauffeurs_operateur()).
create or replace function public.evenements_course(p_course_id uuid)
 returns setof public.course_events
 language sql
 security definer
 set search_path to ''
as $function$
  select ev.*
  from public.course_events ev
  join public.courses c on c.id = ev.course_id
  join public.operateurs o on o.id = c.operateur_id
  where ev.course_id = p_course_id and o.owner_user_id = auth.uid()
  order by ev.created_at;
$function$;

revoke all on function public.evenements_course(uuid) from public, anon;
grant execute on function public.evenements_course(uuid) to authenticated;

-- Les deux fonctions trigger ne doivent jamais etre appelables directement
-- comme RPC (uniquement via le mecanisme de trigger) -- ce projet accorde
-- EXECUTE a anon/authenticated par defaut a la creation, meme apres un
-- REVOKE FROM PUBLIC ; revoke explicite pour les deux roles nommes.
revoke all on function public.enregistrer_evenement_course() from public, anon, authenticated;
revoke all on function public.enregistrer_evenement_notation() from public, anon, authenticated;

-- Identification de l'acteur (purement additif, aucun changement de
-- comportement) : une ligne set_config() ajoutee en tete de chaque RPC qui
-- fait transiter une course, lue par les triggers ci-dessus.

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

  insert into public.courses (operateur_id, passager_id, adresse_depart, adresse_arrivee, prix_estime, distance_km, depart_lat, depart_lng, arrivee_lat, arrivee_lng, statut)
  values (p_operateur_id, v_passager_id, p_adresse_depart, p_adresse_arrivee, v_prix, v_distance_km, p_depart_lat, p_depart_lng, p_arrivee_lat, p_arrivee_lng, 'en_recherche')
  returning public.courses.id into v_course_id;

  return query select v_course_id, v_prix, v_distance_km;
end;
$function$;

create or replace function public.accepter_course(p_course_id uuid, p_chauffeur_id uuid, p_telephone text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows int;
begin
  perform set_config('app.acteur', 'chauffeur:' || trim(coalesce(p_telephone, '')), true);

  if not exists (select 1 from public.chauffeurs where id = p_chauffeur_id and telephone = trim(p_telephone)) then
    raise exception 'Telephone ne correspond pas au chauffeur';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if not exists (
    select 1
    from public.chauffeurs ch
    join public.courses c on c.id = p_course_id
    where ch.id = p_chauffeur_id and ch.operateur_id = c.operateur_id
  ) then
    raise exception 'Ce chauffeur n''appartient pas a l''operateur de cette course';
  end if;

  update public.courses
  set chauffeur_id = p_chauffeur_id, statut = 'assignee', assignee_at = now()
  where id = p_course_id and statut = 'en_recherche';

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.chauffeurs set statut = 'en_course' where id = p_chauffeur_id;
    return true;
  end if;

  return false;
end;
$function$;

create or replace function public.avancer_course(p_course_id uuid, p_nouveau_statut text, p_telephone text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_statut_actuel text;
  v_chauffeur_id uuid;
begin
  perform set_config('app.acteur', 'chauffeur:' || trim(coalesce(p_telephone, '')), true);

  select statut, chauffeur_id into v_statut_actuel, v_chauffeur_id
  from public.courses where id = p_course_id
  for update;

  if v_statut_actuel is null then
    raise exception 'Course introuvable';
  end if;

  if v_chauffeur_id is null or not exists (
    select 1 from public.chauffeurs where id = v_chauffeur_id and telephone = trim(p_telephone)
  ) then
    raise exception 'Telephone ne correspond pas au chauffeur assigne a cette course';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if v_statut_actuel = 'assignee' and p_nouveau_statut = 'en_cours' then
    update public.courses set statut = 'en_cours' where id = p_course_id;
  elsif v_statut_actuel = 'en_cours' and p_nouveau_statut = 'terminee' then
    update public.courses
    set statut = 'terminee', terminee_at = now(),
        prix_final = coalesce(prix_final, prix_estime)
    where id = p_course_id;
    update public.chauffeurs set statut = 'disponible' where id = v_chauffeur_id;
  else
    raise exception 'Transition invalide: % -> %', v_statut_actuel, p_nouveau_statut;
  end if;
end;
$function$;

create or replace function public.annuler_course(p_course_id uuid, p_telephone text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chauffeur_id uuid;
  v_ok boolean;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  select true into v_ok
  from public.courses c
  join public.passagers p on p.id = c.passager_id
  where c.id = p_course_id and p.telephone = trim(p_telephone);

  if v_ok is null then
    raise exception 'Telephone ne correspond pas au passager de cette course';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  update public.courses
  set statut = 'annulee'
  where id = p_course_id and statut in ('en_recherche','assignee')
  returning chauffeur_id into v_chauffeur_id;

  if v_chauffeur_id is not null then
    update public.chauffeurs set statut = 'disponible' where id = v_chauffeur_id;
  end if;
end;
$function$;

create or replace function public.operateur_cloturer_course(p_course_id uuid, p_nouveau_statut text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_operateur_id uuid;
  v_chauffeur_id uuid;
  v_rows int;
begin
  perform set_config('app.acteur', 'operateur:' || coalesce(auth.uid()::text, 'inconnu'), true);

  if p_nouveau_statut not in ('terminee', 'annulee') then
    raise exception 'Statut invalide : %', p_nouveau_statut;
  end if;

  select c.operateur_id, c.chauffeur_id into v_operateur_id, v_chauffeur_id
  from public.courses c where c.id = p_course_id;

  if v_operateur_id is null then
    raise exception 'Course introuvable';
  end if;

  if not exists (select 1 from public.operateurs o where o.id = v_operateur_id and o.owner_user_id = auth.uid()) then
    raise exception 'Non autorise a cloturer cette course';
  end if;

  update public.courses
  set statut = p_nouveau_statut,
      terminee_at = case when p_nouveau_statut = 'terminee' then coalesce(terminee_at, now()) else terminee_at end,
      prix_final = case when p_nouveau_statut = 'terminee' then coalesce(prix_final, prix_estime) else prix_final end
  where id = p_course_id and statut in ('en_recherche', 'assignee', 'en_cours');

  get diagnostics v_rows = row_count;

  if v_rows = 1 and v_chauffeur_id is not null then
    update public.chauffeurs set statut = 'disponible' where id = v_chauffeur_id and statut = 'en_course';
  end if;

  return v_rows = 1;
end;
$function$;

create or replace function public.noter_course(p_course_id uuid, p_telephone text, p_note integer, p_commentaire text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_avis_id uuid;
  v_ok boolean;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  if p_note < 1 or p_note > 5 then
    raise exception 'Note invalide';
  end if;

  select true into v_ok
  from public.courses c
  join public.passagers p on p.id = c.passager_id
  where c.id = p_course_id
    and c.statut = 'terminee'
    and p.telephone = trim(p_telephone);

  if v_ok is null then
    raise exception 'Course introuvable, non terminee, ou telephone ne correspond pas au passager';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  insert into public.avis_courses (course_id, note, commentaire)
  values (p_course_id, p_note, nullif(trim(p_commentaire), ''))
  returning id into v_avis_id;

  return v_avis_id;
end;
$function$;
