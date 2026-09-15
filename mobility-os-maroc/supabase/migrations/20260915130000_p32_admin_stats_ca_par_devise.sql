-- P32 : suite de l'audit du 15/09 -- corrige l'agregation multi-devises de
-- admin_stats_globales, laissee volontairement non traitee lors de
-- foundation_v1_devise_affichage (voir le commentaire de cette migration :
-- "question a trancher au moment ou un second pays devient actif").
--
-- Aujourd'hui toutes les courses "terminee" comptabilisees sont en MAD
-- (TransAtlas + Test QA) -- Test QA Senegal (XOF) n'a encore aucune course
-- terminee, donc ca_total (une simple somme numeric) est par coincidence
-- encore juste. Mais des la premiere course XOF terminee, cette somme
-- additionnerait des montants dans deux devises differentes sans le dire --
-- decision produit prise avec l'utilisateur : repartir le CA par devise
-- plutot que de le convertir (pas de table de taux a maintenir, pas de
-- dependance a une API de change externe, toujours exact).
--
-- ca_total (numeric) -> ca_par_devise (jsonb, ex: {"MAD": 3111.36,
-- "XOF": 15000.31}). Le type de retour change donc CREATE OR REPLACE est
-- refuse par Postgres (contrairement a un simple parametre en plus avec
-- defaut) -- DROP explicite puis CREATE, comme d'habitude dans ce cas.
--
-- Tout le reste (comptages, verification admin_plateforme, SECURITY
-- DEFINER, search_path vide) est strictement inchange.

drop function public.admin_stats_globales();

create function public.admin_stats_globales()
returns table(
  nb_operateurs bigint,
  nb_operateurs_actifs bigint,
  nb_chauffeurs bigint,
  nb_passagers bigint,
  nb_courses bigint,
  nb_courses_terminees bigint,
  ca_par_devise jsonb
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.admin_plateforme where user_id = auth.uid()) then
    raise exception 'Accès réservé aux administrateurs de la plateforme.';
  end if;

  return query
  select
    (select count(*) from public.operateurs)::bigint,
    (select count(*) from public.operateurs where actif)::bigint,
    (select count(*) from public.chauffeurs)::bigint,
    (select count(*) from public.passagers)::bigint,
    (select count(*) from public.courses)::bigint,
    (select count(*) from public.courses where statut = 'terminee')::bigint,
    (
      select coalesce(jsonb_object_agg(t.currency, t.total), '{}'::jsonb)
      from (
        select c.currency, sum(c.prix_final) as total
        from public.courses c
        where c.statut = 'terminee'
        group by c.currency
      ) t
    );
end;
$function$;

revoke all on function public.admin_stats_globales() from public, anon;
grant execute on function public.admin_stats_globales() to authenticated;
