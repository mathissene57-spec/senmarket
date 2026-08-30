-- SENLINK — Security Hardening intermédiaire
-- Corrige deux failles découvertes en auditant l'état réel du projet
-- (thduksfosaylbjimrgrn) juste après application de la migration de base
-- (20260829120000_senlink_init_schema.sql) — voir la conversation de
-- revue pour le détail complet.
--
-- Ceci est une migration DISTINCTE et identifiable à dessein : ni la
-- migration de base (déjà appliquée), ni "Migration 1 — Security Core"
-- (toujours un document de travail, non appliquée) ne sont modifiées
-- pour absorber ces découvertes.
--
-- 1) anon avait encore UPDATE/INSERT/DELETE sur shipments (hérité du
--    privilège par défaut Supabase, jamais révoqué pour anon — seul
--    authenticated avait été traité pour UPDATE). Sans effet pratique
--    aujourd'hui car RLS bloque déjà anon sur chaque politique
--    (auth.uid() est toujours NULL pour anon), mais la RLS ne doit pas
--    être la seule barrière quand un privilège de table inutile existe.
--
-- 2) record_shipment_event() était exécutable par PUBLIC (donc par
--    anon) : PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute
--    fonction nouvellement créée, contrairement aux tables — la
--    migration de base ne l'avait jamais révoqué. Confirmé par
--    get_advisors (lint anon_security_definer_function_executable).
--    Impact réel : la version actuelle de record_shipment_event()
--    (non durcie — Migration 1 pas encore appliquée) n'a aucune
--    vérification d'authentification, seulement une exigence de
--    preuve trivialement falsifiable par un appelant anonyme.
--    handle_new_user() reçoit le même traitement : fonction TRIGGER
--    uniquement (accède à NEW), un appel RPC direct échoue de toute
--    façon au niveau moteur ("trigger functions can only be called as
--    triggers"), mais autant fermer l'exposition API inutile.
--
-- is_admin() n'est PAS touchée ici, volontairement : vérifié en direct
-- contre pg_policies avant d'écrire ce fichier — 14 politiques RLS sur
-- 11 tables en dépendent (hubs, incidents ×2, notifications,
-- organizations, pickup_points, profiles, shipment_lots, shipments ×3,
-- transporters, user_roles ×2). Révoquer l'EXECUTE de authenticated
-- casserait l'évaluation RLS, donc l'application entière, pour tout
-- utilisateur authentifié non-admin. Revoquer seulement anon n'apporte
-- aucun bénéfice de sécurité réel (anon échoue déjà sur toutes les
-- politiques concernées faute de privilège de table ou de auth.uid()),
-- juste un mode d'erreur différent. Laissé en l'état.

-- ---------------------------------------------------------------------------
-- 1. anon : aucun accès direct d'écriture à shipments
-- ---------------------------------------------------------------------------
revoke update on shipments from anon;
revoke insert on shipments from anon;
revoke delete on shipments from anon;

-- ---------------------------------------------------------------------------
-- 2. record_shipment_event() : fermer l'EXECUTE implicite accordé à PUBLIC
-- ---------------------------------------------------------------------------
revoke execute on function record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
) from public;
grant execute on function record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user() : fonction trigger uniquement, jamais destinée à un
--    appel RPC direct (aucune autre référence trouvée que le trigger
--    trg_handle_new_user sur auth.users)
-- ---------------------------------------------------------------------------
revoke execute on function handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- 4. Hardening search_path sur les 3 fonctions qui n'en avaient pas encore
--    (les 4 autres -- record_shipment_event, handle_new_user, is_admin,
--    get_public_tracking -- l'avaient déjà depuis la migration de base)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function generate_shipment_tracking_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_suffix text;
begin
  if new.tracking_code is null or length(trim(new.tracking_code)) = 0 then
    v_suffix := lpad((floor(random() * 999999))::int::text, 6, '0');
    new.tracking_code := 'SL-' || new.origin_country || '-' || new.destination_country || '-' || v_suffix;
  end if;
  if new.qr_code_data is null then
    new.qr_code_data := new.tracking_code;
  end if;
  return new;
end;
$$;

create or replace function prevent_direct_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.via_record_event', true), '') <> 'true' then
    raise exception 'shipments.status can only be changed via record_shipment_event()';
  end if;
  return new;
end;
$$;
