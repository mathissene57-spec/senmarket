-- P18 : quand le passager met fin a la course (annuler_course /
-- passager_terminer_course), a n'importe quelle etape, le chauffeur assigne
-- ne recevait jusqu'ici AUCUNE notification push -- notifier_etape_course()
-- ne regardait que passagers.telephone. Cote donnees le chauffeur etait deja
-- correctement remis 'disponible' (annuler_course / passager_terminer_course
-- le faisaient deja), seul le signal vers le chauffeur manquait.
--
-- On distingue "cloture par le passager" de "cloture par le chauffeur
-- lui-meme" via app.acteur (deja pose par chaque RPC de cycle de vie avant
-- sa mise a jour, format 'role:identifiant') : inutile de notifier un
-- chauffeur d'une action qu'il vient de faire lui-meme (avancer_course).
create or replace function public.notifier_etape_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telephone text;
  v_telephone_chauffeur text;
  v_titre text;
  v_corps text;
  v_acteur text := current_setting('app.acteur', true);
begin
  if new.statut is distinct from old.statut then
    select p.telephone into v_telephone from public.passagers p where p.id = new.passager_id;
    if v_telephone is not null then
      if new.statut = 'assignee' then v_titre := 'Chauffeur trouve'; v_corps := 'Un chauffeur a accepte votre course et arrive.';
      elsif new.statut = 'en_cours' then v_titre := 'En route'; v_corps := 'Votre chauffeur est arrive, la course a commence.';
      elsif new.statut = 'terminee' then v_titre := 'Course terminee'; v_corps := 'Vous etes arrive a destination.';
      elsif new.statut = 'sans_chauffeur' then v_titre := 'Aucun chauffeur disponible'; v_corps := 'Personne n''a accepte votre demande, reessayez.';
      elsif new.statut = 'annulee' then v_titre := 'Course annulee'; v_corps := 'Votre course a ete annulee.';
      end if;
      if v_titre is not null then
        perform public.declencher_push(v_telephone, v_titre, v_corps);
      end if;
    end if;

    if new.statut in ('terminee', 'annulee') and new.chauffeur_id is not null
       and (v_acteur is null or v_acteur not like 'chauffeur:%') then
      select ch.telephone into v_telephone_chauffeur from public.chauffeurs ch where ch.id = new.chauffeur_id;
      if v_telephone_chauffeur is not null then
        if new.statut = 'terminee' then
          perform public.declencher_push(v_telephone_chauffeur, 'Course terminee', 'Le passager a mis fin a la course. Vous etes de nouveau disponible.');
        else
          perform public.declencher_push(v_telephone_chauffeur, 'Course annulee', 'Le passager a annule la course. Vous etes de nouveau disponible.');
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$function$;
