-- P3 (L-1, plan de finalisation V1) : demander_otp() ne limitait le debit
-- que par numero de telephone (3 demandes / 10 min / numero) -- un bot
-- capable de faire tourner de nombreux numeros differents (achetes, generes,
-- ou simplement incrementes) pouvait donc declencher un envoi de SMS reel
-- illimite au niveau de la plateforme entiere, une fois un vrai fournisseur
-- SMS branche (cf. C-1/envoyer_sms_otp) -- un vecteur de fraude connu
-- ("SMS pumping fraud"), qui se traduit directement par une facture
-- fournisseur qui explose, pas seulement une nuisance.
--
-- Ajoute un coupe-circuit global, en plus de la limite par numero deja en
-- place (jamais a la remplacer) : au-dela de 20 demandes tous numeros
-- confondus sur la derniere minute, toute nouvelle demande est rejetee.
-- Seuil choisi largement au-dessus du trafic legitime attendu pour un
-- pilote (quelques operateurs, quelques dizaines d'utilisateurs actifs) --
-- a ajuster a la hausse si le volume reel de connexions simultanees
-- legitimes s'en approche.
--
-- NOTE (voir migration suivante, 20260905130000) : cette premiere version
-- compte TOUS les otp_codes recents sans distinction, y compris les
-- numeros de demo utilises par la suite de regression -- corrigee juste
-- apres, avant tout commit, en excluant ces numeros du compteur.
create index if not exists otp_codes_created_at_idx on public.otp_codes (created_at);

create or replace function public.demander_otp(p_telephone text)
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
  v_recentes_global int;
begin
  if v_telephone is null or length(v_telephone) < 6 then
    raise exception 'Numero de telephone invalide';
  end if;

  select count(*) into v_recentes_global
  from public.otp_codes
  where created_at > now() - interval '1 minute';

  if v_recentes_global >= 20 then
    raise exception 'Service temporairement indisponible, reessayez dans une minute.';
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
