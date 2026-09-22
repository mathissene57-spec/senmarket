-- P35 : corrections des points critiques/importants de l'audit pre-lancement
-- du 22/09/2026 (2, 3, 4 corriges completement ; 1 partiellement -- voir note).

-- ---------------------------------------------------------------------
-- 1) courses : reduit la dependance de l'app a la policy RLS large sur
--    courses (necessaire pour Realtime/postgres_changes avec un role
--    anon sans session -- une fermeture complete demanderait de migrer
--    vers Realtime Broadcast + Authorization, hors perimetre ici).
--    Nouvelle RPC qui remplace les deux lectures directes
--    .from('courses').select(...).eq('id', ...) (reverifierCourse cote
--    passager, verifierCourseActive cote chauffeur) -- filtre toujours
--    sur l'id fourni (128 bits d'entropie, jamais de scan possible),
--    au lieu de dependre de la policy de table large.
create or replace function public.etat_course(p_course_id uuid)
returns table(id uuid, statut text, adresse_depart text, adresse_arrivee text,
              prix_estime numeric, prix_final numeric, currency text, chauffeur_id uuid)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.statut, c.adresse_depart, c.adresse_arrivee, c.prix_estime, c.prix_final, c.currency, c.chauffeur_id
  from public.courses c
  where c.id = p_course_id;
$$;

grant execute on function public.etat_course(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) OTP entierement desactive en production : est_telephone_verifie()
--    renvoyait toujours true, et verifier_otp() acceptait le code
--    maitre '000000' pour N'IMPORTE QUEL numero -- n'importe qui
--    pouvait se faire passer pour n'importe quel passager/chauffeur.
--
--    Le code maitre ne fonctionne plus QUE pour les numeros de test
--    reconnus (otp_demo_telephones existante + prefixes reserves par
--    la suite E2E : 0700000* Maroc, 780000* Senegal -- e2e/fixtures.ts,
--    plages fictives, jamais des numeros clients). Pour tout autre
--    numero, une verification reelle (SMS) est desormais exigee.
--
--    est_telephone_verifie() verifie reellement qu'un code a ete
--    confirme pour ce numero il y a moins de 30 jours (correspond a la
--    session "reste connecte" deja implicite cote app -- le numero est
--    stocke en localStorage sans jamais redemander de code).
--
--    ATTENTION operationnelle : tant que les secrets Vault du
--    fournisseur SMS (SMS_WEBHOOK_SECRET, SMS_PROVIDER_ACCOUNT_SID,
--    SMS_PROVIDER_AUTH_TOKEN, SMS_PROVIDER_FROM_NUMBER) ne sont pas
--    configures, aucun vrai utilisateur (hors numeros de test) ne peut
--    recevoir de code et donc ne peut plus rien faire sur la plateforme
--    -- c'est le comportement correct et voulu une fois cette faille
--    fermee, mais ca bloque tout utilisateur reel jusqu'a la config SMS.
create or replace function public.est_telephone_verifie(p_telephone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.otp_codes
    where telephone = p_telephone
      and verifie = true
      and verifie_at > now() - interval '30 days'
  );
$$;

create or replace function public.verifier_otp(p_telephone text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telephone text := trim(p_telephone);
  v_id uuid;
  v_hash text;
  v_tentatives int;
  v_est_test boolean;
begin
  v_est_test := trim(p_code) = '000000' and (
    exists (select 1 from public.otp_demo_telephones d where d.telephone = v_telephone)
    or v_telephone like '0700000%'
    or v_telephone like '780000%'
  );

  if v_est_test then
    insert into public.otp_codes (telephone, code_hash, expire_at, verifie, verifie_at)
    values (v_telephone, '', now() + interval '5 minutes', true, now());
    return true;
  end if;

  select id, code_hash, tentatives into v_id, v_hash, v_tentatives
  from public.otp_codes
  where telephone = v_telephone
    and verifie = false
    and expire_at > now()
  order by created_at desc
  limit 1
  for update;

  if v_id is null then
    raise exception 'Aucun code valide pour ce numero, redemandez-en un.';
  end if;

  if v_tentatives >= 5 then
    raise exception 'Trop de tentatives, redemandez un code.';
  end if;

  update public.otp_codes set tentatives = tentatives + 1 where id = v_id;

  if v_hash = encode(extensions.digest(trim(p_code) || v_telephone, 'sha256'), 'hex') then
    update public.otp_codes set verifie = true, verifie_at = now() where id = v_id;
    return true;
  end if;

  return false;
end;
$function$;

-- Chauffeur de test Senegal (771234567, "Chauffeur Test Dakar") n'etait
-- pas dans la liste demo -- ajoute pour que la connexion silencieuse
-- (P20) retombe proprement sur l'ecran OTP + code maitre, sans casser
-- le test E2E existant.
insert into public.otp_demo_telephones (telephone)
values ('771234567')
on conflict (telephone) do nothing;

-- ---------------------------------------------------------------------
-- 3) operateurs : un proprietaire pouvait modifier n'importe quelle
--    colonne de son propre operateur via un appel REST direct (au lieu
--    de nom/ville/logo/couleurs uniquement, comme prevu par le
--    dashboard) -- notamment actif (reserve admin : un operateur
--    suspendu par admin_definir_statut_operateur pouvait se reactiver
--    lui-meme instantanement).
revoke update on public.operateurs from authenticated;
grant update (nom, ville, logo_url, couleur_primaire, couleur_secondaire) on public.operateurs to authenticated;

-- ---------------------------------------------------------------------
-- 4) avis_courses : aucune contrainte n'empechait plusieurs avis pour
--    la meme course -- un passager pouvait spammer des notes pour
--    manipuler chauffeurs.note_moyenne (recalculee automatiquement a
--    chaque insertion). Deja constate en donnees reelles pendant
--    l'audit (6 courses avec 2-3 avis chacune, doublons issus de
--    re-tests, pas de malveillance -- mais la faille etait reelle).
--
--    Dedoublonnage (garde l'avis le plus ancien de chaque course), puis
--    recalcul du note_moyenne des chauffeurs concernes avant d'ajouter
--    la contrainte qui empeche toute recidive.
delete from public.avis_courses a
using (
  select id, row_number() over (partition by course_id order by created_at asc, id asc) as rang
  from public.avis_courses
) doublons
where a.id = doublons.id and doublons.rang > 1;

update public.chauffeurs ch
set note_moyenne = coalesce((
  select round(avg(a.note)::numeric, 1)
  from public.avis_courses a
  join public.courses c on c.id = a.course_id
  where c.chauffeur_id = ch.id
), 5.0)
where exists (select 1 from public.courses c where c.chauffeur_id = ch.id);

alter table public.avis_courses add constraint avis_courses_course_id_key unique (course_id);

create or replace function public.noter_course(p_course_id uuid, p_telephone text, p_note integer, p_commentaire text default null::text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_avis_id uuid;
  v_ok boolean;
begin
  perform set_config('app.acteur', 'passager:' || trim(coalesce(p_telephone, '')), true);

  if p_note < 1 or p_note > 5 then
    raise exception 'Note invalide';
  end if;

  select true into v_ok
  from public.courses c
  join public.passagers p on p.id = c.passager_id
  where c.id = p_course_id
    and c.statut = 'terminee'
    and p.telephone = trim(p_telephone);

  if v_ok is null then
    raise exception 'Course introuvable, non terminee, ou telephone ne correspond pas au passager';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if exists (select 1 from public.avis_courses where course_id = p_course_id) then
    raise exception 'Cette course a deja ete notee.';
  end if;

  insert into public.avis_courses (course_id, note, commentaire)
  values (p_course_id, p_note, nullif(trim(p_commentaire), ''))
  returning id into v_avis_id;

  return v_avis_id;
end;
$function$;
