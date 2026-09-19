-- P34 : le passager doit voir la position GPS en direct de son chauffeur des
-- que celui-ci a accepte la course (demande explicite), pas seulement le
-- trajet statique depart-arrivee.
--
-- chauffeurs.position_lat/position_lng sont deliberement exclues du GRANT
-- anon/authenticated depuis le durcissement H-1/H-2 (colonnes qui, ouvertes
-- table entiere, exposeraient la position de TOUS les chauffeurs en tout
-- temps -- chauffeurs_lecture_publique a qual=true). Meme pattern que
-- obtenir_contact_course : une RPC SECURITY DEFINER qui ne revele la
-- position que si l'appelant prouve (par telephone verifie) qu'il est bien
-- le passager de CETTE course precise, et seulement pendant qu'elle est
-- active (assignee ou en_cours) -- jamais avant l'acceptation, jamais apres
-- la fin de course.
create or replace function public.position_chauffeur_course(p_course_id uuid, p_telephone text)
returns table(lat numeric, lng numeric, maj_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telephone text := trim(p_telephone);
begin
  if not public.est_telephone_verifie(v_telephone) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  return query
  select ch.position_lat, ch.position_lng, ch.position_maj_at
  from public.courses c
  join public.passagers p on p.id = c.passager_id
  join public.chauffeurs ch on ch.id = c.chauffeur_id
  where c.id = p_course_id
    and p.telephone = v_telephone
    and c.statut in ('assignee', 'en_cours');
end;
$$;

grant execute on function public.position_chauffeur_course(uuid, text) to anon, authenticated;
