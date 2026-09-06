-- FOUNDATION V1 -- etape 4 (suite) : le trigger d'audit trail journalise
-- desormais aussi la devise dans les details de l'evenement 'creee', pour
-- que dashboard/page.tsx (libelleEvenement) affiche "estime X MAD" au lieu
-- de "X DH" en dur. Additif : cle jsonb en plus, comportement de l'audit
-- trail inchange pour tout consommateur qui ne lit pas cette cle.

create or replace function public.enregistrer_evenement_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur, details)
    values (new.id, new.operateur_id, 'creee', null, current_setting('app.acteur', true), jsonb_build_object('prix_estime', new.prix_estime, 'currency', new.currency));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.statut is distinct from old.statut then
    insert into public.course_events (course_id, operateur_id, type, chauffeur_id, acteur, details)
    values (new.id, new.operateur_id, new.statut, new.chauffeur_id, current_setting('app.acteur', true), jsonb_build_object('statut_precedent', old.statut));
  end if;

  return new;
end;
$function$;
