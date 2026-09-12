-- P21 : desactivation TEMPORAIRE de la verification OTP par SMS, sur
-- demande explicite du client, pour faciliter les tests reels prevus
-- suite au deploiement Foundation V1 -- validee explicitement pour TOUS
-- les operateurs (TransAtlas, Toure Transport, Test QA) et LES DEUX
-- roles (chauffeurs et passagers), au-dela du perimetre de P20 (qui ne
-- dispensait que les chauffeurs TransAtlas et laissait explicitement
-- Toure Transport sur l'OTP normal).
--
-- Portee : "jusqu'a nouvel ordre", comme P20 -- pas une decision
-- d'architecture definitive. A restaurer des que les tests sont termines
-- ou qu'un vrai fournisseur SMS est configure (voir P19 : aucun secret
-- SMS_* n'existe dans le Vault a ce jour, envoyer_sms_otp() ne delivre
-- donc de toute facon jamais reellement de code).
--
-- Choix technique : est_telephone_verifie() retourne desormais
-- inconditionnellement true, plutot que d'etendre le mecanisme par-
-- operateur de P20 (otp_dispense_chauffeurs) a un mecanisme miroir pour
-- les passagers -- les passagers ne sont pas rattaches a un operateur_id
-- dans le schema (seulement country_id), donc un flag "par operateur"
-- n'a pas de point d'ancrage propre cote passager. Un bypass global est
-- plus honnete qu'une plomberie par-operateur qui ne collerait pas
-- vraiment au schema.
--
-- Reversible en une seule migration : restaurer le corps de fonction
-- ci-dessous (identique a celui pose par P20) desactive le bypass sans
-- toucher a otp_dispense_chauffeurs ni a aucune autre donnee :
--
--   create or replace function public.est_telephone_verifie(p_telephone text)
--   returns boolean language sql stable security definer set search_path = ''
--   as $$
--     select
--       exists (
--         select 1 from public.otp_codes
--         where telephone = p_telephone and verifie = true
--           and verifie_at > now() - interval '24 hours'
--       )
--       or exists (
--         select 1 from public.chauffeurs ch
--         join public.operateurs o on o.id = ch.operateur_id
--         where ch.telephone = p_telephone and o.otp_dispense_chauffeurs = true
--       );
--   $$;

create or replace function public.est_telephone_verifie(p_telephone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select true;
$function$;
