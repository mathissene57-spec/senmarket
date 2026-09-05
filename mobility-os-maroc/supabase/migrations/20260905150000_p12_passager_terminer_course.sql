-- P12 : le passager doit pouvoir mettre fin a sa course a tout moment
-- (demande produit, suite a un blocage reel en test : une course restee
-- "assignee" sans que le chauffeur ne l'avance jamais, et sans dashboard
-- deploye pour la cloturer cote operateur).
--
-- annuler_course() existant ne couvre que en_recherche/assignee -> annulee
-- (avant prise en charge). Cette nouvelle RPC couvre TOUS les etats actifs
-- et choisit le statut resultant selon l'etat courant :
--   en_recherche / assignee -> annulee   (course jamais vraiment commencee)
--   en_cours                -> terminee (le passager choisit de clore lui-meme)
create function public.passager_terminer_course(p_course_id uuid, p_telephone text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_statut_actuel text;
  v_chauffeur_id uuid;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  if not exists (
    select 1 from public.courses c
    join public.passagers p on p.id = c.passager_id
    where c.id = p_course_id and p.telephone = trim(p_telephone)
  ) then
    raise exception 'Telephone ne correspond pas au passager de cette course';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  select statut, chauffeur_id into v_statut_actuel, v_chauffeur_id
  from public.courses where id = p_course_id
  for update;

  if v_statut_actuel not in ('en_recherche', 'assignee', 'en_cours') then
    raise exception 'Cette course est deja cloturee (statut: %)', v_statut_actuel;
  end if;

  if v_statut_actuel = 'en_cours' then
    update public.courses
    set statut = 'terminee', terminee_at = now(),
        prix_final = coalesce(prix_final, prix_estime)
    where id = p_course_id;
  else
    update public.courses set statut = 'annulee' where id = p_course_id;
  end if;

  if v_chauffeur_id is not null then
    update public.chauffeurs set statut = 'disponible' where id = v_chauffeur_id and statut = 'en_course';
  end if;
end;
$function$;

grant execute on function public.passager_terminer_course(uuid, text) to anon, authenticated;
