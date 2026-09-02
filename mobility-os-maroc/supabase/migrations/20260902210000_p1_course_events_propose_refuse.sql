-- P1 (suite) : evenements "proposee" / "refusee" -- le seul morceau du fil
-- d'une course qui n'existait nulle part cote serveur (le refus etait
-- 100% local a l'app chauffeur). Deux nouvelles RPC, purement journalisantes
-- (aucune ecriture sur courses/chauffeurs, aucun impact sur le dispatch) :
-- le chauffeur les appelle quand une demande s'affiche a l'ecran, et quand
-- il la refuse.

alter table public.course_events drop constraint course_events_type_check;
alter table public.course_events add constraint course_events_type_check
  check (type in ('creee','proposee','refusee','assignee','en_cours','terminee','annulee','sans_chauffeur','notee'));

create or replace function public.proposer_course(p_course_id uuid, p_chauffeur_id uuid, p_telephone text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_operateur_id uuid;
begin
  if not exists (select 1 from public.chauffeurs where id = p_chauffeur_id and telephone = trim(p_telephone)) then
    raise exception 'Telephone ne correspond pas au chauffeur';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  select c.operateur_id into v_operateur_id
  from public.courses c
  join public.chauffeurs ch on ch.id = p_chauffeur_id and ch.operateur_id = c.operateur_id
  where c.id = p_course_id;

  if v_operateur_id is null then
    raise exception 'Course introuvable ou n''appartient pas a l''operateur de ce chauffeur';
  end if;

  insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur)
  values (p_course_id, v_operateur_id, 'proposee', p_chauffeur_id, 'chauffeur:' || trim(p_telephone));
end;
$function$;

create or replace function public.refuser_course(p_course_id uuid, p_chauffeur_id uuid, p_telephone text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_operateur_id uuid;
begin
  if not exists (select 1 from public.chauffeurs where id = p_chauffeur_id and telephone = trim(p_telephone)) then
    raise exception 'Telephone ne correspond pas au chauffeur';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  select c.operateur_id into v_operateur_id
  from public.courses c
  join public.chauffeurs ch on ch.id = p_chauffeur_id and ch.operateur_id = c.operateur_id
  where c.id = p_course_id;

  if v_operateur_id is null then
    raise exception 'Course introuvable ou n''appartient pas a l''operateur de ce chauffeur';
  end if;

  insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur)
  values (p_course_id, v_operateur_id, 'refusee', p_chauffeur_id, 'chauffeur:' || trim(p_telephone));
end;
$function$;
