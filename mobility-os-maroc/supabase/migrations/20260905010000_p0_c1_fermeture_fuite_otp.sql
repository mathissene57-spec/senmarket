-- P0.1 (C-1) : demander_otp() ne doit plus jamais renvoyer le code en clair a
-- l'appelant. Avant ce correctif, n'importe qui pouvait "verifier" n'importe
-- quel numero de telephone (y compris un numero qui ne lui appartient pas)
-- simplement en lisant le code dans la reponse du meme appel qui le genere --
-- confirme exploitable en direct le 2026-09-05 (audit "Angles Morts", C-1).
-- Cela annulait la protection est_telephone_verifie() partout ou elle est
-- utilisee (creer_course, accepter_course, avancer_course, annuler_course,
-- noter_course, connexion_chauffeur, definir_disponibilite_chauffeur,
-- mettre_a_jour_position, envoyer_message_course, enregistrer_push_subscription).
--
-- Le code est desormais uniquement transmis par SMS, via une nouvelle edge
-- function send-otp-sms declenchee en fire-and-forget par pg_net -- meme
-- patron que declencher_push/send-push deja en production. Tant qu'aucun
-- fournisseur SMS n'est configure dans Vault (secret SMS_WEBHOOK_SECRET
-- absent, confirme le 2026-09-05 : aucun secret SMS_* n'existe), l'envoi est
-- un no-op silencieux -- le code est genere, hache, stocke, rate-limite,
-- mais jamais delivre. C'est un etat de securite correct (aucune fuite),
-- meme si l'OTP n'est pas encore utilisable de bout en bout pour un vrai
-- utilisateur tant qu'un vrai fournisseur SMS n'est pas branche.
--
-- Pont operationnel pour les demos/pilote sans fournisseur SMS reel : une
-- liste explicite et restreinte de numeros ("otp_demo_telephones", geree
-- uniquement par l'equipe via le SQL editor Supabase -- jamais via l'app ni
-- via une RPC exposee) recoit EN PLUS le code en clair dans
-- otp_codes.code_demo, colonne jamais lue par aucune RPC accessible a
-- anon/authenticated. Pour tout autre numero, le code en clair n'est jamais
-- persiste ni renvoye nulle part.

create table public.otp_demo_telephones (
  telephone text primary key,
  created_at timestamptz not null default now()
);
alter table public.otp_demo_telephones enable row level security;
-- Aucune policy : deny-all en acces direct, meme patron que otp_codes/
-- admin_plateforme/push_subscriptions. Gestion exclusivement par l'equipe via
-- le SQL editor (role owner, non soumis a RLS), jamais via une RPC exposee.

alter table public.otp_codes add column code_demo text;

drop function public.demander_otp(text);

create function public.demander_otp(p_telephone text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_telephone text := trim(p_telephone);
  v_code text;
  v_hash text;
  v_recentes int;
begin
  if v_telephone is null or length(v_telephone) < 6 then
    raise exception 'Numero de telephone invalide';
  end if;

  select count(*) into v_recentes
  from public.otp_codes
  where telephone = v_telephone and created_at > now() - interval '10 minutes';

  if v_recentes >= 3 then
    raise exception 'Trop de demandes de code pour ce numero, reessayez dans quelques minutes.';
  end if;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_hash := encode(extensions.digest(v_code || v_telephone, 'sha256'), 'hex');

  insert into public.otp_codes (telephone, code_hash, expire_at, code_demo)
  values (
    v_telephone, v_hash, now() + interval '5 minutes',
    case when exists (select 1 from public.otp_demo_telephones d where d.telephone = v_telephone) then v_code else null end
  );

  perform public.envoyer_sms_otp(v_telephone, v_code);
end;
$function$;

-- Meme exposition qu'avant le drop (anon + authenticated en ont besoin pour
-- demander un code) -- seul le comportement interne change, plus le contrat.
revoke all on function public.demander_otp(text) from public;
grant execute on function public.demander_otp(text) to anon, authenticated;

-- Fonction d'envoi, jamais appelable directement -- seule demander_otp()
-- l'invoque, sous son propre definisseur.
create function public.envoyer_sms_otp(p_telephone text, p_code text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'SMS_WEBHOOK_SECRET';
  if v_secret is null then return; end if;
  perform net.http_post(
    url := 'https://hfybtcyhhzgwirtqdqmt.supabase.co/functions/v1/send-otp-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('telephone', p_telephone, 'code', p_code)
  );
end;
$function$;

revoke all on function public.envoyer_sms_otp(text, text) from public, anon, authenticated;

-- Lu par l'edge function send-otp-sms (client service_role), jamais par un
-- navigateur -- meme patron que obtenir_secrets_push_notifications().
create function public.obtenir_secrets_sms()
 returns table(name text, decrypted_secret text)
 language sql
 security definer
 set search_path to ''
as $function$
  select name, decrypted_secret from vault.decrypted_secrets
  where name in ('SMS_WEBHOOK_SECRET', 'SMS_PROVIDER_ACCOUNT_SID', 'SMS_PROVIDER_AUTH_TOKEN', 'SMS_PROVIDER_FROM_NUMBER');
$function$;

revoke all on function public.obtenir_secrets_sms() from public, anon, authenticated;
grant execute on function public.obtenir_secrets_sms() to service_role;

-- Outil de test/demo : jamais expose a anon/authenticated, jamais appele par
-- le frontend. Enregistre automatiquement le numero dans la liste de demo
-- (idempotent) puis renvoie le code genere -- reserve au role proprietaire
-- (SQL editor Supabase) et a la suite de regression (supabase/tests/regression.sql).
create function public.test_demander_otp_et_lire_code(p_telephone text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_telephone text := trim(p_telephone);
  v_code text;
begin
  insert into public.otp_demo_telephones (telephone) values (v_telephone)
  on conflict (telephone) do nothing;

  perform public.demander_otp(v_telephone);

  select code_demo into v_code from public.otp_codes
  where telephone = v_telephone
  order by created_at desc
  limit 1;

  return v_code;
end;
$function$;

revoke all on function public.test_demander_otp_et_lire_code(text) from public, anon, authenticated;
