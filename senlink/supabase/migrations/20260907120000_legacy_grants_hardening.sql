-- SENLINK — Migration 4 : Security Hardening / Legacy Grants
-- Corrige les faiblesses identifiées lors de l'audit du 7 septembre 2026 sur le schéma de
-- base (20260829120000_senlink_init_schema.sql), jamais réexaminé depuis. Cette migration
-- est strictement un durcissement de sécurité : aucune table créée, aucun modèle de données
-- modifié, aucun cycle de vie métier changé, aucune RPC de Migration 1/2/3 touchée.
--
-- Contexte de l'audit (voir conversation de conception pour le détail complet) :
--   1. incidents_insert (with_check: reported_by = auth.uid()) ne vérifiait aucune relation
--      entre l'appelant et le shipment_id visé -- un utilisateur authentifié pouvait
--      attacher un incident à n'importe quel colis du système. C'est le seul problème de
--      sécurité/intégrité réellement confirmé.
--   2. incidents_select et shipment_events_select reposaient sur une protection IMPLICITE
--      (EXISTS(SELECT 1 FROM shipments ...) sans condition d'appartenance, protégé en
--      pratique uniquement parce que ce sous-select hérite de la RLS de `shipments` sous
--      SECURITY INVOKER). Vérifié empiriquement (transactions ROLLBACK, set local role +
--      request.jwt.claims) : PAS de fuite active aujourd'hui. Durcies quand même par
--      prudence, pour ne plus dépendre d'une protection implicite qui disparaîtrait
--      silencieusement si `shipments` devenait un jour plus permissive.
--   3. 9 tables du schéma de base (hubs, incidents, notifications, organizations,
--      pickup_points, profiles, shipment_events, transporters, user_roles) conservaient
--      encore le GRANT Postgres complet par défaut (DELETE/INSERT/REFERENCES/SELECT/
--      TRIGGER/TRUNCATE/UPDATE) à anon ET authenticated, jamais nettoyé depuis leur
--      création. Remplacé par un grant minimal, justifié table par table par un
--      consommateur réel et actuel (jamais "RLS le bloquera de toute façon", jamais pour
--      une fonctionnalité future hypothétique) -- voir le détail par table ci-dessous.
--
-- can_access_shipment(uuid) est une fonction NOUVELLE (SECURITY INVOKER), qui recopie mot
-- pour mot les 4 branches déjà en place dans shipments_client_select (Migration 1, non
-- modifiée par ce fichier) : client (client_user_id = auth.uid()), admin (is_admin()),
-- agent point relais (user_roles.role='agent_point_relais' + pickup_point_id), transporteur
-- (user_roles.role='transporteur' + transporter_id via transporters). Aucune récursion RLS
-- possible : shipments/user_roles/transporters ne référencent en retour ni incidents, ni
-- shipment_events, ni cette fonction. Vérifié en transaction ROLLBACK (set local role
-- authenticated + request.jwt.claims simulé) que la fonction s'exécute sans erreur de
-- permission et retourne false pour un utilisateur non lié à un shipment de test.
--
-- Grants retenus, justifiés par consommateur réel uniquement :
--   hubs/organizations/pickup_points/transporters : SELECT seul (anon+authenticated) --
--     les policies *_public_read (qual=true) sont elles-mêmes le mécanisme conçu pour une
--     lecture publique ; aucune écriture directe n'est exercée par un code réel aujourd'hui
--     (les RPC qui les touchent sont SECURITY DEFINER, insensibles à ce grant) -- écriture
--     retirée.
--   profiles : SELECT/INSERT/UPDATE (authenticated) -- profiles_self_insert/self_update
--     n'ont de sens que comme écriture directe côté client, aucune RPC équivalente
--     n'existe.
--   notifications : SELECT seul (authenticated) -- aucune policy d'écriture n'existe.
--   user_roles : SELECT seul (authenticated) -- aucune RPC de gestion des rôles n'existe,
--     aucun code n'écrit directement ; l'écriture précédemment envisagée en V1 de cette
--     migration a été retirée faute de consommateur réel.
--   incidents : SELECT/INSERT/UPDATE (authenticated) -- incidents_insert et
--     incidents_admin_update n'ont de sens que comme écriture directe, aucune RPC
--     "declare_incident" ou "resolve_incident" n'existe.
--   shipment_events : SELECT seul (authenticated) -- record_shipment_event() (Migration 1,
--     SECURITY DEFINER) reste l'unique voie d'écriture, insensible à ce grant.
--   Aucun accès anon sur incidents/notifications/profiles/shipment_events/user_roles.
--
-- Rollback exact fourni en commentaire de fin de fichier (restaure précisément le snapshot
-- pré-migration constaté le 7 septembre, jamais un GRANT ALL générique).

-- ============================================================
-- PREFLIGHT CHECKS — si une assertion échoue, la migration s'arrête entièrement
-- ============================================================
do $preflight$
begin
  if to_regclass('public.hubs') is null or to_regclass('public.incidents') is null
    or to_regclass('public.notifications') is null or to_regclass('public.organizations') is null
    or to_regclass('public.pickup_points') is null or to_regclass('public.profiles') is null
    or to_regclass('public.shipment_events') is null or to_regclass('public.transporters') is null
    or to_regclass('public.user_roles') is null or to_regclass('public.shipments') is null
  then
    raise exception 'PREFLIGHT FAILED: une ou plusieurs tables attendues sont absentes';
  end if;

  if to_regprocedure('public.is_admin()') is null then
    raise exception 'PREFLIGHT FAILED: is_admin() introuvable';
  end if;
  if to_regprocedure('public.record_shipment_event(uuid, text, text, text, numeric, numeric, text, text, text, jsonb, jsonb)') is null then
    raise exception 'PREFLIGHT FAILED: record_shipment_event() a une signature différente de celle attendue -- Migration 1 aurait changé';
  end if;
  if to_regprocedure('public.declare_lot_departure(uuid, text, jsonb)') is null
    or to_regprocedure('public.record_lot_location(uuid, numeric, numeric, text, numeric, numeric, numeric, jsonb)') is null
  then
    raise exception 'PREFLIGHT FAILED: signatures RPC Migration 2/3 différentes de celles attendues';
  end if;

  -- Comparaison par sous-chaînes clés plutôt qu'égalité stricte : pg_get_expr() peut
  -- reformater les parenthèses englobantes différemment selon le contexte d'appel sans que
  -- la logique change (constaté lors de la première tentative d'application -- faux
  -- positif corrigé ici). Ces sous-chaînes restent suffisantes pour détecter une vraie
  -- dérive (ex. l'ajout d'une condition d'appartenance ferait disparaître le motif exact
  -- "shipments s ... WHERE (s.id = ...)").
  if not exists (
    select 1 from pg_policy where polname = 'incidents_select' and polrelid = 'public.incidents'::regclass
      and pg_get_expr(polqual, polrelid) like '%is_admin()%'
      and pg_get_expr(polqual, polrelid) like '%FROM shipments s%'
      and pg_get_expr(polqual, polrelid) like '%s.id = incidents.shipment_id%'
  ) then
    raise exception 'PREFLIGHT FAILED: incidents_select a un texte différent de celui audité le 7 septembre -- ne pas appliquer aveuglément';
  end if;
  if not exists (
    select 1 from pg_policy where polname = 'shipment_events_select' and polrelid = 'public.shipment_events'::regclass
      and pg_get_expr(polqual, polrelid) like '%FROM shipments s%'
      and pg_get_expr(polqual, polrelid) like '%s.id = shipment_events.shipment_id%'
  ) then
    raise exception 'PREFLIGHT FAILED: shipment_events_select a un texte différent de celui audité';
  end if;
  if not exists (
    select 1 from pg_policy where polname = 'incidents_insert' and polrelid = 'public.incidents'::regclass
      and pg_get_expr(polwithcheck, polrelid) like '%reported_by = auth.uid()%'
  ) then
    raise exception 'PREFLIGHT FAILED: incidents_insert a un texte différent de celui audité';
  end if;

  if not exists (
    select 1 from pg_policy where polname = 'shipments_client_select' and polrelid = 'public.shipments'::regclass
      and pg_get_expr(polqual, polrelid) like '%agent_point_relais%' and pg_get_expr(polqual, polrelid) like '%transporteur%'
  ) then
    raise exception 'PREFLIGHT FAILED: shipments_client_select a changé depuis l''audit -- can_access_shipment() doit être re-comparée avant d''appliquer';
  end if;

  if to_regprocedure('public.can_access_shipment(uuid)') is not null then
    raise exception 'PREFLIGHT FAILED: public.can_access_shipment(uuid) existe déjà -- vérifier manuellement avant de continuer';
  end if;

  raise notice 'PREFLIGHT OK -- toutes les vérifications sont passées, migration autorisée à continuer';
end;
$preflight$;

-- ============================================================
-- 1. Fonction d'autorisation partagée (nouvelle)
-- ============================================================
create or replace function public.can_access_shipment(p_shipment_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
stable
as $function$
  select exists (
    select 1 from public.shipments s
    where s.id = p_shipment_id
      and (
        s.client_user_id = auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'agent_point_relais'
            and ur.pickup_point_id = s.current_pickup_point_id
        )
        or exists (
          select 1 from public.user_roles ur
          join public.transporters t on t.id = s.assigned_transporter_id
          where ur.user_id = auth.uid()
            and ur.role = 'transporteur'
            and ur.transporter_id = t.id
        )
      )
  );
$function$;

revoke execute on function public.can_access_shipment(uuid) from public, anon;
grant execute on function public.can_access_shipment(uuid) to authenticated;

-- ============================================================
-- 2. incidents_select (durcissement préventif)
-- ============================================================
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents
for select
using ( public.can_access_shipment(shipment_id) );

-- ============================================================
-- 3. incidents_insert (correctif réel)
-- ============================================================
drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents
for insert
with check (
  reported_by = auth.uid()
  and public.can_access_shipment(shipment_id)
);

-- incidents_admin_update : non touchée.

-- ============================================================
-- 4. shipment_events_select (durcissement préventif)
-- ============================================================
drop policy if exists shipment_events_select on public.shipment_events;
create policy shipment_events_select on public.shipment_events
for select
using ( public.can_access_shipment(shipment_id) );

-- ============================================================
-- 5. GRANT minimal, justifié par consommateur réel uniquement
-- ============================================================
revoke all on public.hubs from anon, authenticated;
grant select on public.hubs to anon, authenticated;

revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to anon, authenticated;

revoke all on public.pickup_points from anon, authenticated;
grant select on public.pickup_points to anon, authenticated;

revoke all on public.transporters from anon, authenticated;
grant select on public.transporters to anon, authenticated;

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

revoke all on public.incidents from anon, authenticated;
grant select, insert, update on public.incidents to authenticated;

revoke all on public.shipment_events from anon, authenticated;
grant select on public.shipment_events to authenticated;

-- ============================================================
-- ROLLBACK EXACT (à exécuter manuellement en cas de besoin -- restaure précisément le
-- snapshot pré-migration constaté le 7 septembre 2026, jamais un GRANT ALL générique) :
--
-- drop policy if exists incidents_select on public.incidents;
-- create policy incidents_select on public.incidents for select
-- using ( is_admin() OR (EXISTS ( SELECT 1 FROM shipments s WHERE (s.id = incidents.shipment_id))) );
--
-- drop policy if exists incidents_insert on public.incidents;
-- create policy incidents_insert on public.incidents for insert
-- with check ( reported_by = auth.uid() );
--
-- drop policy if exists shipment_events_select on public.shipment_events;
-- create policy shipment_events_select on public.shipment_events for select
-- using ( (EXISTS ( SELECT 1 FROM shipments s WHERE (s.id = shipment_events.shipment_id))) );
--
-- drop function if exists public.can_access_shipment(uuid);
--
-- grant delete, insert, references, select, trigger, truncate, update on public.hubs to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.organizations to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.pickup_points to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.transporters to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.profiles to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.notifications to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.user_roles to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.incidents to anon, authenticated;
-- grant delete, insert, references, select, trigger, truncate, update on public.shipment_events to anon, authenticated;
-- ============================================================
