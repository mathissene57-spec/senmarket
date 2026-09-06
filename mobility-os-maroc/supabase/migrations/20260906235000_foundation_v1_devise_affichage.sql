-- FOUNDATION V1 -- etape 4 (suite) : propager currency vers les RPC de
-- lecture consommees par l'affichage, pour remplacer les litteraux "DH"
-- codes en dur cote frontend. Signatures et comportement de filtrage/
-- permission strictement inchanges -- seule une colonne currency est
-- ajoutee au TABLE de retour de chacune.
--
-- admin_lister_operateurs avait EXECUTE revoque de PUBLIC/anon (reserve a
-- authenticated + verification interne admin_plateforme) -- reapplique a
-- l'identique apres le DROP+CREATE, sans quoi le DROP+CREATE la
-- re-exposerait par defaut (regression de securite a eviter).
--
-- admin_stats_globales (chiffre d'affaires PLATEFORME, agrege sur TOUS les
-- operateurs a la fois) n'est volontairement PAS touchee ici : contrairement
-- aux 4 fonctions ci-dessous, chaque ligne desquelles reste scopee a un seul
-- operateur/une seule course (donc une seule devise coherente), agreger un
-- montant cross-operateurs n'a plus de sens des que plusieurs devises
-- existeront reellement -- question a trancher au moment ou un second pays
-- devient actif, pas ici.

drop function if exists public.historique_chauffeur(uuid, text);
create function public.historique_chauffeur(p_chauffeur_id uuid, p_telephone text)
returns table(id uuid, adresse_depart text, adresse_arrivee text, prix_final numeric, currency text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  return query
  select c.id, c.adresse_depart, c.adresse_arrivee, c.prix_final, c.currency, c.created_at
  from public.courses c
  join public.chauffeurs ch on ch.id = c.chauffeur_id
  where c.chauffeur_id = p_chauffeur_id
    and ch.telephone = trim(p_telephone)
    and c.statut = 'terminee'
  order by c.created_at desc;
end;
$function$;

drop function if exists public.historique_passager(text);
create function public.historique_passager(p_telephone text)
returns table(id uuid, statut text, adresse_depart text, adresse_arrivee text, prix_estime numeric, prix_final numeric, currency text, chauffeur_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_passager_id uuid;
begin
  if p_telephone is null or length(trim(p_telephone)) = 0 then
    return;
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  select p.id into v_passager_id
  from public.passagers p
  where p.telephone = trim(p_telephone);

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

drop function if exists public.courses_operateur(uuid);
create function public.courses_operateur(p_operateur_id uuid)
returns table(id uuid, operateur_id uuid, passager_id uuid, chauffeur_id uuid, statut text, adresse_depart text, adresse_arrivee text, prix_estime numeric, prix_final numeric, currency text, distance_km numeric, depart_lat numeric, depart_lng numeric, arrivee_lat numeric, arrivee_lng numeric, rayon_recherche_km numeric, created_at timestamptz, assignee_at timestamptz, terminee_at timestamptz, bloquee boolean, type_vehicule text, type_course text, trajet_interville_id uuid)
language sql
security definer
set search_path = ''
as $function$
  select
    c.id, c.operateur_id, c.passager_id, c.chauffeur_id, c.statut,
    c.adresse_depart, c.adresse_arrivee, c.prix_estime, c.prix_final, c.currency,
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

drop function if exists public.admin_lister_operateurs();
create function public.admin_lister_operateurs()
returns table(id uuid, nom text, slug text, ville text, actif boolean, couleur_primaire text, created_at timestamptz, nb_chauffeurs bigint, nb_courses bigint, nb_courses_terminees bigint, ca_total numeric, devise text, derniere_course_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (select 1 from public.admin_plateforme ap where ap.user_id = auth.uid()) then
    raise exception 'Accès réservé aux administrateurs de la plateforme.';
  end if;

  return query
  select
    o.id, o.nom, o.slug, o.ville, o.actif, o.couleur_primaire, o.created_at,
    coalesce(ch.nb, 0)::bigint,
    coalesce(co.nb_total, 0)::bigint,
    coalesce(co.nb_terminees, 0)::bigint,
    coalesce(co.ca_total, 0)::numeric,
    coalesce(cy.currency, 'MAD'),
    co.derniere_course_at
  from public.operateurs o
  left join public.countries cy on cy.id = o.country_id
  left join (
    select c.operateur_id as operateur_id, count(*) as nb
    from public.chauffeurs c
    group by c.operateur_id
  ) ch on ch.operateur_id = o.id
  left join (
    select
      c.operateur_id as operateur_id,
      count(*) as nb_total,
      count(*) filter (where c.statut = 'terminee') as nb_terminees,
      sum(c.prix_final) filter (where c.statut = 'terminee') as ca_total,
      max(c.created_at) as derniere_course_at
    from public.courses c
    group by c.operateur_id
  ) co on co.operateur_id = o.id
  order by o.created_at;
end;
$function$;

revoke all on function public.admin_lister_operateurs() from public, anon;
grant execute on function public.admin_lister_operateurs() to authenticated;
