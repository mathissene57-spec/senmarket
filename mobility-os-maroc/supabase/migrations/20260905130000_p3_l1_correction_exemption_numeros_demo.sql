-- Correction de 20260905120000_p3_l1_limite_globale_anti_bot_otp.sql (meme
-- jour) : le premier coupe-circuit global comptait TOUS les otp_codes
-- recents sans distinction, ce qui aurait fait echouer la suite de
-- regression elle-meme (39 appels a demander_otp() via des numeros de demo
-- en quelques secondes, tres au-dela du seuil de 20 -- confirme par un
-- dry-run avant tout commit). Corrige : le compteur global ignore
-- desormais les numeros de la liste de demo (otp_demo_telephones) --
-- exactement ceux utilises par la suite de tests -- et ne compte que les
-- demandes reelles (code_demo is null), qui sont l'unique mesure
-- pertinente d'un abus generant un vrai cout SMS.
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
  v_est_demo boolean;
begin
  if v_telephone is null or length(v_telephone) < 6 then
    raise exception 'Numero de telephone invalide';
  end if;

  v_est_demo := exists (select 1 from public.otp_demo_telephones d where d.telephone = v_telephone);

  if not v_est_demo then
    select count(*) into v_recentes_global
    from public.otp_codes
    where created_at > now() - interval '1 minute' and code_demo is null;

    if v_recentes_global >= 20 then
      raise exception 'Service temporairement indisponible, reessayez dans une minute.';
    end if;
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
    case when v_est_demo then v_code else null end
  );

  perform public.envoyer_sms_otp(v_telephone, v_code);
end;
$function$;
