-- P16 : messagerie course -- ajout photo + note vocale, en plus du texte.
-- contenu redevient optionnel (legende/texte), type distingue le contenu,
-- media_path pointe vers le bucket public "messages-media".

alter table public.messages_course
  add column if not exists type text not null default 'texte',
  add column if not exists media_path text;

alter table public.messages_course
  drop constraint if exists messages_course_type_check;
alter table public.messages_course
  add constraint messages_course_type_check check (type in ('texte', 'image', 'audio'));

alter table public.messages_course
  drop constraint if exists messages_course_contenu_check;
alter table public.messages_course
  add constraint messages_course_contenu_check check (
    (type = 'texte' and contenu is not null and length(trim(contenu)) > 0 and length(contenu) <= 1000)
    or (type <> 'texte' and media_path is not null and (contenu is null or length(contenu) <= 300))
  );

-- Bucket public : la messagerie course n'a jamais eu de controle d'acces
-- plus fin qu'un match telephone/course_id via RPC (pas de session Supabase
-- Auth reelle, uniquement l'auth telephone/OTP maison) -- meme niveau de
-- confiance que le reste de l'app, pas une regression.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages-media', 'messages-media', true, 15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'audio/webm','audio/ogg','audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/x-m4a']
)
on conflict (id) do nothing;

drop policy if exists "messages_media_insert" on storage.objects;
create policy "messages_media_insert" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'messages-media');

drop function if exists public.envoyer_message_course(uuid, text, text);
drop function if exists public.messages_course(uuid, text);

create function public.envoyer_message_course(
  p_course_id uuid, p_telephone text, p_contenu text,
  p_type text default 'texte', p_media_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telephone text := trim(p_telephone);
  v_contenu text := nullif(trim(coalesce(p_contenu, '')), '');
  v_type text := coalesce(nullif(trim(p_type), ''), 'texte');
  v_expediteur text;
  v_id uuid;
begin
  if not public.est_telephone_verifie(v_telephone) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if v_type not in ('texte', 'image', 'audio') then
    raise exception 'Type de message invalide';
  end if;

  if v_type = 'texte' then
    if v_contenu is null or length(v_contenu) > 1000 then
      raise exception 'Message invalide';
    end if;
  else
    if p_media_path is null or length(trim(p_media_path)) = 0 then
      raise exception 'Fichier manquant';
    end if;
    if v_contenu is not null and length(v_contenu) > 300 then
      raise exception 'Legende trop longue';
    end if;
  end if;

  if exists (
    select 1 from public.courses c
    join public.passagers p on p.id = c.passager_id
    where c.id = p_course_id and p.telephone = v_telephone
  ) then
    v_expediteur := 'passager';
  elsif exists (
    select 1 from public.courses c
    join public.chauffeurs ch on ch.id = c.chauffeur_id
    where c.id = p_course_id and ch.telephone = v_telephone
  ) then
    v_expediteur := 'chauffeur';
  else
    raise exception 'Telephone ne correspond a aucune des deux parties de cette course';
  end if;

  if not exists (select 1 from public.courses where id = p_course_id and statut in ('assignee', 'en_cours')) then
    raise exception 'Cette course n''est plus active';
  end if;

  insert into public.messages_course (course_id, expediteur, contenu, type, media_path)
  values (p_course_id, v_expediteur, v_contenu, v_type, case when v_type = 'texte' then null else trim(p_media_path) end)
  returning id into v_id;

  return v_id;
end;
$function$;

create function public.messages_course(p_course_id uuid, p_telephone text)
returns table(id uuid, expediteur text, contenu text, type text, media_path text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_telephone text := trim(p_telephone);
begin
  if not public.est_telephone_verifie(v_telephone) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if not exists (
    select 1 from public.courses c
    join public.passagers p on p.id = c.passager_id
    where c.id = p_course_id and p.telephone = v_telephone
  ) and not exists (
    select 1 from public.courses c
    join public.chauffeurs ch on ch.id = c.chauffeur_id
    where c.id = p_course_id and ch.telephone = v_telephone
  ) then
    raise exception 'Telephone ne correspond a aucune des deux parties de cette course';
  end if;

  return query
  select m.id, m.expediteur, m.contenu, m.type, m.media_path, m.created_at
  from public.messages_course m
  where m.course_id = p_course_id
  order by m.created_at asc;
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
  v_corps text;
begin
  if new.expediteur = 'passager' then
    select ch.telephone into v_telephone_destinataire
    from public.courses c join public.chauffeurs ch on ch.id = c.chauffeur_id
    where c.id = new.course_id;
  else
    select p.telephone into v_telephone_destinataire
    from public.courses c join public.passagers p on p.id = c.passager_id
    where c.id = new.course_id;
  end if;
  if v_telephone_destinataire is not null then
    v_corps := case new.type
      when 'image' then '📷 Photo'
      when 'audio' then '🎤 Note vocale'
      else left(coalesce(new.contenu, ''), 150)
    end;
    perform public.declencher_push(v_telephone_destinataire, 'Nouveau message', v_corps);
  end if;
  return new;
end;
$function$;
