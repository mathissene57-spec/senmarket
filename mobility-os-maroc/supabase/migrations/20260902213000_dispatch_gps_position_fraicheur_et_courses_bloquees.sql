-- Dispatch/GPS (suite de l'audit Phase 0, §3/§7) : deux trous identifies --
-- "chauffeur disponible" n'etait jamais distingue de "chauffeur reellement
-- joignable" (position_maj_at existe mais n'etait verifie nulle part), et
-- rien ne signalait une course assignee qui ne progresse jamais (chauffeur
-- qui accepte puis disparait). Purement additif : chauffeurs_operateur() et
-- courses_operateur() gagnent chacune une colonne calculee, aucun
-- changement de comportement ailleurs (dispatch, acceptation, etc. inchanges).

-- Changement de type de retour : DROP necessaire (CREATE OR REPLACE ne
-- permet pas de changer le type de retour d'une fonction existante).
drop function public.chauffeurs_operateur(uuid);

create function public.chauffeurs_operateur(p_operateur_id uuid)
 returns table (
   id uuid, operateur_id uuid, nom text, telephone text, vehicule text, plaque text,
   statut text, note_moyenne numeric, created_at timestamptz,
   position_lat numeric, position_lng numeric, position_maj_at timestamptz,
   position_recente boolean
 )
 language sql
 security definer
 set search_path to ''
as $function$
  select
    c.id, c.operateur_id, c.nom, c.telephone, c.vehicule, c.plaque,
    c.statut, c.note_moyenne, c.created_at,
    c.position_lat, c.position_lng, c.position_maj_at,
    (c.position_maj_at is not null and c.position_maj_at > now() - interval '2 minutes') as position_recente
  from public.chauffeurs c
  where c.operateur_id = p_operateur_id
    and exists (
      select 1 from public.operateurs o
      where o.id = p_operateur_id and o.owner_user_id = auth.uid()
    )
  order by c.created_at desc;
$function$;

revoke all on function public.chauffeurs_operateur(uuid) from public, anon;
grant execute on function public.chauffeurs_operateur(uuid) to authenticated;

drop function public.courses_operateur(uuid);

create function public.courses_operateur(p_operateur_id uuid)
 returns table (
   id uuid, operateur_id uuid, passager_id uuid, chauffeur_id uuid, statut text,
   adresse_depart text, adresse_arrivee text, prix_estime numeric, prix_final numeric,
   distance_km numeric, depart_lat numeric, depart_lng numeric, arrivee_lat numeric, arrivee_lng numeric,
   rayon_recherche_km numeric, created_at timestamptz, assignee_at timestamptz, terminee_at timestamptz,
   bloquee boolean
 )
 language sql
 security definer
 set search_path to ''
as $function$
  select
    c.id, c.operateur_id, c.passager_id, c.chauffeur_id, c.statut,
    c.adresse_depart, c.adresse_arrivee, c.prix_estime, c.prix_final,
    c.distance_km, c.depart_lat, c.depart_lng, c.arrivee_lat, c.arrivee_lng,
    c.rayon_recherche_km, c.created_at, c.assignee_at, c.terminee_at,
    (c.statut = 'assignee' and c.assignee_at is not null and c.assignee_at < now() - interval '20 minutes') as bloquee
  from public.courses c
  where c.operateur_id = p_operateur_id
    and exists (
      select 1 from public.operateurs o
      where o.id = p_operateur_id and o.owner_user_id = auth.uid()
    )
  order by c.created_at desc;
$function$;

revoke all on function public.courses_operateur(uuid) from public, anon;
grant execute on function public.courses_operateur(uuid) to authenticated;
