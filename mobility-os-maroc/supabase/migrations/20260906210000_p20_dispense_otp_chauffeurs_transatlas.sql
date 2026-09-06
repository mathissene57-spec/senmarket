-- P20 : dispense de code OTP pour les chauffeurs d'une flotte donnee, sur
-- demande explicite du client, en attendant qu'un fournisseur SMS reel soit
-- configure (aucun secret SMS n'existe dans le Vault a ce jour -- voir P19 :
-- envoyer_sms_otp() ne fait donc jamais rien, le code n'atteint jamais
-- reellement le telephone du chauffeur, meme en production). Sans fournisseur,
-- la double authentification est actuellement injoignable pour un vrai
-- chauffeur de flotte -- seuls les numeros de la liste demo (otp_demo_
-- telephones) ont un code lisible, et uniquement via un acces direct a la
-- base reserve a l'operateur technique.
--
-- Portee volontairement limitee : seuls les CHAUFFEURS de l'operateur
-- TransAtlas sont dispenses, jusqu'a nouvel ordre. Les passagers et les
-- autres operateurs (Toure transport, Test QA) gardent l'OTP normal.
-- Reversible en une ligne (update operateurs set otp_dispense_chauffeurs =
-- false ...), sans avoir a toucher au code une seconde fois.

alter table public.operateurs
  add column if not exists otp_dispense_chauffeurs boolean not null default false;

update public.operateurs
set otp_dispense_chauffeurs = true
where id = '20c2a76e-6f18-42ff-b95d-4895dcd6e49c';

create or replace function public.est_telephone_verifie(p_telephone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.otp_codes
      where telephone = p_telephone
        and verifie = true
        and verifie_at > now() - interval '24 hours'
    )
    or exists (
      select 1 from public.chauffeurs ch
      join public.operateurs o on o.id = ch.operateur_id
      where ch.telephone = p_telephone
        and o.otp_dispense_chauffeurs = true
    );
$function$;
