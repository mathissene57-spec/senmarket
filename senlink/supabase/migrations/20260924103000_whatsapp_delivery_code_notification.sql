-- SenLink — envoi du code de retrait (delivery_otp) par WhatsApp, en plus de
-- son affichage QR/lien dans l'app, via l'API Meta WhatsApp Cloud.
--
-- Contexte : notify_client_on_shipment_event() (20260912210000) ne branchait
-- jusqu'ici que le channel 'in_app' de la table notifications ; WhatsApp/SMS
-- restaient hors périmètre faute d'intégration. Cette migration ajoute
-- l'appel WhatsApp, déclenché au même endroit (trigger AFTER INSERT sur
-- shipment_events), dès qu'un code de retrait est (re)généré par
-- record_shipment_event (statuts 'out_for_delivery'/'at_pickup_point' —
-- voir 20260924100000_domestic_delivery_senegal.sql) et qu'un
-- recipient_phone existe (fonctionne pour un envoi guest sans
-- client_user_id, contrairement à la notification in_app).
--
-- Architecture :
--   Postgres (ce trigger) --pg_net (async, fire-and-forget)--> Edge Function
--   send-whatsapp-otp --Meta Graph API--> WhatsApp du destinataire.
-- Authentification Postgres -> Edge Function : un secret partagé généré
-- ici et stocké dans Supabase Vault (jamais en clair dans ce fichier ni
-- dans l'historique git), envoyé en header x-internal-secret. Volontairement
-- PAS le service_role key du projet : un secret dédié, à portée strictement
-- limitée à cette seule fonction, correspond mieux au principe du moindre
-- privilège qu'une clé qui contourne RLS sur tout le projet.
--
-- Best-effort strict : toute erreur dans le bloc WhatsApp est avalée
-- (exception when others) — un souci d'envoi ne doit jamais faire échouer
-- la transition de statut elle-même, qui reste la source de vérité.
--
-- Édge Function send-whatsapp-otp déjà déployée séparément (project
-- thduksfosaylbjimrgrn). Reste à configurer côté Supabase (secrets Edge
-- Function, hors SQL) : WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
-- INTERNAL_NOTIFY_SECRET (valeur générée par cette migration, à relire dans
-- vault.decrypted_secrets), et côté Meta : un template WhatsApp approuvé à
-- 2 variables ({{1}}=code, {{2}}=lien de suivi) — un message business-initié
-- hors fenêtre de conversation de 24h ne peut pas être du texte libre.

do $preflight$
begin
  if exists (
    select 1 from vault.secrets where name = 'internal_notify_secret'
  ) then
    raise exception 'PREFLIGHT FAILED: internal_notify_secret existe déjà dans Vault';
  end if;
end;
$preflight$;

-- SCHEMA extensions (pas public) : pg_net crée de toute façon ses fonctions
-- sous le schéma dédié `net` (net.http_post, indépendant de ce paramètre),
-- mais l'installer dans `public` déclenche l'avertissement de sécurité
-- "Extension in Public" du linter Supabase — évité ici comme pour
-- pgcrypto/uuid-ossp, déjà dans extensions.
create extension if not exists pg_net schema extensions;

select vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'internal_notify_secret',
  'Secret partagé Postgres -> Edge Function send-whatsapp-otp (notify_client_on_shipment_event). Doit aussi être défini comme secret Edge Function INTERNAL_NOTIFY_SECRET.'
);

create or replace function public.notify_client_on_shipment_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_client_user_id uuid;
  v_tracking_code text;
  v_recipient_phone text;
  v_delivery_otp text;
  v_label text;
  v_secret text;
  v_request_id bigint;
begin
  select client_user_id, tracking_code, recipient_phone, delivery_otp
    into v_client_user_id, v_tracking_code, v_recipient_phone, v_delivery_otp
  from public.shipments
  where id = new.shipment_id;

  -- in_app : uniquement si un compte client existe (architecture guest
  -- possible côté schéma : client_user_id est nullable).
  if v_client_user_id is not null then
    v_label := case new.new_status
      when 'created' then 'Créé'
      when 'dropped_off' then 'Déposé au point relais'
      when 'inspected' then 'Contrôlé'
      when 'departed_origin' then 'Départ'
      when 'in_transit_international' then 'Transit international'
      when 'customs_clearance' then 'Contrôle douanier'
      when 'arrived_destination' then 'Arrivé à destination'
      when 'at_hub' then 'Au hub'
      when 'at_pickup_point' then 'Au point relais'
      when 'out_for_delivery' then 'En cours de livraison'
      when 'delivered' then 'Livré'
      when 'incident' then 'Incident'
      when 'cancelled' then 'Annulé'
      else new.new_status
    end;

    insert into public.notifications (user_id, shipment_id, channel, type, message, status, sent_at)
    values (
      v_client_user_id, new.shipment_id, 'in_app', 'shipment_status_update',
      format('Colis %s : %s', v_tracking_code, v_label), 'sent', now()
    );
  end if;

  -- +++ whatsapp : dès qu'un code de retrait est (re)généré, envoyé au
  -- destinataire réel (recipient_phone), indépendamment de l'existence d'un
  -- compte client_user_id.
  if new.new_status in ('out_for_delivery', 'at_pickup_point')
     and v_recipient_phone is not null and v_delivery_otp is not null then
    begin
      select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'internal_notify_secret';

      if v_secret is not null then
        select net.http_post(
          url := 'https://thduksfosaylbjimrgrn.supabase.co/functions/v1/send-whatsapp-otp',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
          body := jsonb_build_object('to', v_recipient_phone, 'code', v_delivery_otp, 'tracking_code', v_tracking_code)
        ) into v_request_id;

        insert into public.notifications (user_id, shipment_id, channel, type, message, status, sent_at)
        values (
          v_client_user_id, new.shipment_id, 'whatsapp', 'delivery_code',
          format('Code de retrait envoyé au %s (requête pg_net #%s)', v_recipient_phone, v_request_id),
          'sent', now()
        );
      end if;
    exception when others then
      -- un souci d'envoi WhatsApp ne doit jamais faire échouer la
      -- transition de statut (source de vérité), ni record_shipment_event.
      null;
    end;
  end if;

  return new;
end;
$function$;
