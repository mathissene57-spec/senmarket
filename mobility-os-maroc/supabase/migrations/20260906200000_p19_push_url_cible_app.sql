-- P19 : les notifications push n'ont jamais transporte d'URL cible -- le
-- service worker (notificationclick) ouvrait donc systematiquement '/' (la
-- page d'accueil marketing) quand aucun onglet de l'app n'etait deja
-- ouvert en memoire (cas frequent sur mobile : le navigateur decharge un
-- onglet en arriere-plan au bout de quelques minutes). Resultat concret
-- rapporte : le chauffeur "recoit la notification mais rien ne se passe
-- sur son application" -- taper dessus le ramenait sur la page d'accueil
-- generique, pas sur son tableau de bord chauffeur ni sur l'ecran de fin
-- de course ajoute en P18.
--
-- Ce correctif complete P18 (qui ne touchait que la detection cote client
-- une fois l'app deja ouverte) : desormais chaque push transporte le
-- chemin correct (/o/<slug>/chauffeur ou /o/<slug>/passager) pour que le
-- service worker rouvre la bonne page si aucun onglet n'est disponible.

create or replace function public.url_app_notification(p_operateur_id uuid, p_role text)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (select '/o/' || o.slug || '/' || p_role from public.operateurs o where o.id = p_operateur_id),
    '/' || p_role
  );
$function$;

revoke all on function public.url_app_notification(uuid, text) from public, anon, authenticated;

drop function if exists public.declencher_push(text, text, text);

create function public.declencher_push(p_telephone text, p_titre text, p_corps text, p_url text default '/')
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'PUSH_WEBHOOK_SECRET';
  if v_secret is null then return; end if;
  perform net.http_post(
    url := 'https://hfybtcyhhzgwirtqdqmt.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('telephone', p_telephone, 'titre', p_titre, 'corps', p_corps, 'url', coalesce(p_url, '/'))
  );
end;
$function$;

revoke all on function public.declencher_push(text, text, text, text) from public, anon, authenticated;

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
        perform public.declencher_push(v_telephone, v_titre, v_corps, public.url_app_notification(new.operateur_id, 'passager'));
      end if;
    end if;

    if new.statut in ('terminee', 'annulee') and new.chauffeur_id is not null
       and (v_acteur is null or v_acteur not like 'chauffeur:%') then
      select ch.telephone into v_telephone_chauffeur from public.chauffeurs ch where ch.id = new.chauffeur_id;
      if v_telephone_chauffeur is not null then
        if new.statut = 'terminee' then
          perform public.declencher_push(v_telephone_chauffeur, 'Course terminee', 'Le passager a mis fin a la course. Vous etes de nouveau disponible.', public.url_app_notification(new.operateur_id, 'chauffeur'));
        else
          perform public.declencher_push(v_telephone_chauffeur, 'Course annulee', 'Le passager a annule la course. Vous etes de nouveau disponible.', public.url_app_notification(new.operateur_id, 'chauffeur'));
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.notifier_nouveau_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telephone_destinataire text;
  v_operateur_id uuid;
  v_role_destinataire text;
  v_corps text;
begin
  if new.expediteur = 'passager' then
    v_role_destinataire := 'chauffeur';
    select c.operateur_id, ch.telephone into v_operateur_id, v_telephone_destinataire
    from public.courses c join public.chauffeurs ch on ch.id = c.chauffeur_id
    where c.id = new.course_id;
  else
    v_role_destinataire := 'passager';
    select c.operateur_id, p.telephone into v_operateur_id, v_telephone_destinataire
    from public.courses c join public.passagers p on p.id = c.passager_id
    where c.id = new.course_id;
  end if;
  if v_telephone_destinataire is not null then
    v_corps := case new.type
      when 'image' then '📷 Photo'
      when 'audio' then '🎤 Note vocale'
      else left(coalesce(new.contenu, ''), 150)
    end;
    perform public.declencher_push(v_telephone_destinataire, 'Nouveau message', v_corps, public.url_app_notification(v_operateur_id, v_role_destinataire));
  end if;
  return new;
end;
$function$;

create or replace function public.notifier_nouvelle_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_chauffeur record;
begin
  if new.statut = 'en_recherche' and (tg_op = 'INSERT' or old.statut is distinct from 'en_recherche') then
    for v_chauffeur in
      select telephone from public.chauffeurs
      where operateur_id = new.operateur_id and statut = 'disponible' and type_vehicule = new.type_vehicule
    loop
      perform public.declencher_push(v_chauffeur.telephone, 'Nouvelle course !', new.adresse_depart || ' -> ' || new.adresse_arrivee || ' - ' || new.prix_estime || ' DH', public.url_app_notification(new.operateur_id, 'chauffeur'));
    end loop;
  end if;
  return new;
end;
$function$;
