-- P31 : suite de l'audit du 15/09 -- deux corrections independantes.
--
-- 1. historique_passager(p_telephone) retrouvait un passager par telephone
--    SEUL, sans aucun contexte pays/operateur -- le seul RPC, apres relecture
--    complete de tous ceux cites dans foundation_v1_passagers_scope_pays,
--    a reellement souffrir du probleme. Les 4 autres cites dans cette
--    migration (obtenir_contact_course, envoyer_message_course,
--    passager_terminer_course, annuler_course) recoivent tous un
--    p_course_id et verifient le telephone via une JOINTURE sur le
--    passager/chauffeur DEJA lie a CETTE course precise -- jamais une
--    recherche large par telephone seul, donc deja corrects malgre
--    l'avertissement general de cette migration-la. rechercher_mes_commandes,
--    egalement citee, n'existe pas dans ce schema (jamais implementee sous
--    ce nom).
--
--    Ajoute un parametre p_operateur_id (defaut null, retro-compatible) :
--    quand fourni, le passager est recherche par (country_id, telephone) au
--    lieu de telephone seul. Sans lui (vieux appelant), comportement
--    identique a avant -- aucune regression, juste plus precis quand le
--    contexte est disponible. Les deux points d'appel du frontend
--    (app/passager/page.tsx) sont mis a jour pour le fournir.
--
--    Meme piege qu'avec creer_mon_operateur (P23) : CREATE OR REPLACE avec
--    un parametre en plus cree une surcharge au lieu de remplacer -- on
--    DROP explicitement l'ancienne signature a 1 argument juste apres.
--
-- 2. L'operateur "Aftu" (cree via l'auto-inscription le 06/09, avant le
--    correctif P23 de creer_mon_operateur) a un vrai owner_user_id -- ce
--    n'est pas un artefact de test oublie, un compte reel l'a reclame.
--    country_id = null l'empeche de creer la moindre course depuis sa
--    creation. Sa ville ("Casa") indique sans ambiguite une intention
--    marocaine -- backfill vers MA, meme traitement que le backfill
--    d'origine de operateurs.country_id (etape 2 de Foundation V1).

create or replace function public.historique_passager(p_telephone text, p_operateur_id uuid default null)
returns table(id uuid, statut text, adresse_depart text, adresse_arrivee text, prix_estime numeric, prix_final numeric, currency text, chauffeur_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_passager_id uuid;
  v_country_id uuid;
begin
  if p_telephone is null or length(trim(p_telephone)) = 0 then
    return;
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if p_operateur_id is not null then
    select o.country_id into v_country_id from public.operateurs o where o.id = p_operateur_id;
  end if;

  if v_country_id is not null then
    select p.id into v_passager_id
    from public.passagers p
    where p.telephone = trim(p_telephone) and p.country_id = v_country_id;
  else
    select p.id into v_passager_id
    from public.passagers p
    where p.telephone = trim(p_telephone)
    limit 1;
  end if;

  if v_passager_id is null then
    return;
  end if;

  return query
  select c.id, c.statut, c.adresse_depart, c.adresse_arrivee, c.prix_estime, c.prix_final, c.currency, c.chauffeur_id
  from public.courses c
  where c.passager_id = v_passager_id and c.statut = 'terminee'
  order by c.created_at desc;
end;
$function$;

drop function public.historique_passager(text);

update public.operateurs set country_id = (select id from public.countries where code = 'MA')
where slug = 'aftu' and country_id is null;
