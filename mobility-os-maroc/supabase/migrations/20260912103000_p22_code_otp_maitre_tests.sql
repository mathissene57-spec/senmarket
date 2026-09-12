-- P22 : code OTP "maitre" temporaire, sur demande explicite du client --
-- P21 desactivait est_telephone_verifie() (utilisee par creer_course et les
-- autres RPC de cycle de vie), mais l'ecran de connexion passager/chauffeur
-- appelle verifier_otp(telephone, code) AVANT meme d'atteindre ce point :
-- sans fournisseur SMS configure (voir P19/P21), aucun code reel n'est
-- jamais livre, donc cet ecran restait bloquant meme apres P21.
--
-- 000000 est desormais accepte comme code pour N'IMPORTE QUEL numero de
-- telephone, en plus de la verification normale (hash reel) ci-dessous,
-- inchangee. Jusqu'a nouvel ordre, meme portee que P21 -- a retirer des
-- que les tests sont termines ou qu'un vrai fournisseur SMS est configure.
create or replace function public.verifier_otp(p_telephone text, p_code text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_telephone text := trim(p_telephone);
  v_id uuid;
  v_hash text;
  v_tentatives int;
begin
  if trim(p_code) = '000000' then
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
