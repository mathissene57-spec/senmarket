-- Complement a la migration precedente : expirer_courses_en_recherche()
-- (appelee par pg_cron, jamais par un utilisateur) ne posait pas app.acteur
-- -- sans ca, l'evenement 'sans_chauffeur' genere par le cron se retrouvait
-- avec un acteur nul ou residuel au lieu de "systeme:cron".
create or replace function public.expirer_courses_en_recherche()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform set_config('app.acteur', 'systeme:cron', true);

  update public.courses
  set rayon_recherche_km = least(3 + 3 * floor(extract(epoch from (now() - created_at)) / 30), 15)
  where statut = 'en_recherche'
    and rayon_recherche_km < 15;

  update public.courses
  set statut = 'sans_chauffeur'
  where statut = 'en_recherche'
    and created_at < now() - interval '180 seconds';
end;
$function$;
