-- Dette de perf relevée par les advisors Supabase (jamais traitée jusqu'ici) :
-- 26 clés étrangères sans index, 12 policies RLS qui ré-évaluent
-- auth.<fn>() par ligne au lieu de (select auth.<fn>()), et plusieurs
-- tables avec deux policies permissives qui se chevauchent sur SELECT.
-- Aucun changement de comportement voulu ici : mêmes autorisations, moins
-- de travail par requête.

-- ---------------------------------------------------------------------------
-- 1. Index manquants sur les clés étrangères
-- ---------------------------------------------------------------------------

create index if not exists idx_corridors_destination_country on public.corridors(destination_country);
create index if not exists idx_hubs_country on public.hubs(country);
create index if not exists idx_hubs_organization_id on public.hubs(organization_id);
create index if not exists idx_incidents_reported_by on public.incidents(reported_by);
create index if not exists idx_notifications_shipment_id on public.notifications(shipment_id);
create index if not exists idx_organizations_country on public.organizations(country);
create index if not exists idx_pickup_points_country on public.pickup_points(country);
create index if not exists idx_pickup_points_hub_id on public.pickup_points(hub_id);
create index if not exists idx_pickup_points_organization_id on public.pickup_points(organization_id);
create index if not exists idx_shipment_events_actor_user_id on public.shipment_events(actor_user_id);
create index if not exists idx_shipment_lot_events_lot_id on public.shipment_lot_events(lot_id);
create index if not exists idx_shipment_lot_events_shipment_id on public.shipment_lot_events(shipment_id);
create index if not exists idx_shipment_lots_destination_hub_id on public.shipment_lots(destination_hub_id);
create index if not exists idx_shipment_lots_organization_id on public.shipment_lots(organization_id);
create index if not exists idx_shipment_lots_origin_hub_id on public.shipment_lots(origin_hub_id);
create index if not exists idx_shipment_lots_transporter_id on public.shipment_lots(transporter_id);
create index if not exists idx_shipments_created_by on public.shipments(created_by);
create index if not exists idx_shipments_current_hub_id on public.shipments(current_hub_id);
create index if not exists idx_shipments_destination_country on public.shipments(destination_country);
create index if not exists idx_shipments_lot_id on public.shipments(lot_id);
create index if not exists idx_shipments_organization_id on public.shipments(organization_id);
create index if not exists idx_shipments_origin_country on public.shipments(origin_country);
create index if not exists idx_transporters_organization_id on public.transporters(organization_id);
create index if not exists idx_user_roles_hub_id on public.user_roles(hub_id);
create index if not exists idx_user_roles_organization_id on public.user_roles(organization_id);
create index if not exists idx_user_roles_pickup_point_id on public.user_roles(pickup_point_id);

-- ---------------------------------------------------------------------------
-- 1bis. Même bug de grants que hubs/pickup_points/transporters (migration
-- grant_admin_write_hubs_pickup_points_transporters) : les policies RLS
-- d'écriture existent sur corridors/countries/organizations/user_roles,
-- mais authenticated n'a jamais reçu INSERT/UPDATE/DELETE dessus — jamais
-- remarqué faute d'UI les utilisant jusqu'ici. RLS (is_admin()) reste la
-- vraie barrière.
-- ---------------------------------------------------------------------------

grant insert, update, delete on public.corridors to authenticated;
grant insert, update, delete on public.countries to authenticated;
grant insert, update, delete on public.organizations to authenticated;
grant insert, update, delete on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. auth.<fn>() ré-évalué par ligne -> (select auth.<fn>()), calculé une
--    fois par requête. Même logique, texte inchangé à part cet enrobage.
-- ---------------------------------------------------------------------------

ALTER POLICY profiles_self_insert ON public.profiles
  WITH CHECK (id = (select auth.uid()));

ALTER POLICY profiles_self_select ON public.profiles
  USING ((id = (select auth.uid())) OR (select is_admin()));

ALTER POLICY profiles_self_update ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY user_roles_self_select ON public.user_roles
  USING ((user_id = (select auth.uid())) OR (select is_admin()));

ALTER POLICY shipments_client_insert ON public.shipments
  WITH CHECK ((client_user_id = (select auth.uid())) OR (select is_admin()));

ALTER POLICY shipments_client_select ON public.shipments
  USING (
    (client_user_id = (select auth.uid()))
    OR (select is_admin())
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'agent_point_relais'
        AND ur.pickup_point_id = shipments.current_pickup_point_id
    ))
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.transporters t ON t.id = shipments.assigned_transporter_id
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'transporteur'
        AND ur.transporter_id = t.id
    ))
  );

ALTER POLICY shipments_ops_update ON public.shipments
  USING (
    (select is_admin())
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'agent_point_relais'
        AND ur.pickup_point_id = shipments.current_pickup_point_id
    ))
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.transporters t ON t.id = shipments.assigned_transporter_id
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'transporteur'
        AND ur.transporter_id = t.id
    ))
  );

ALTER POLICY notifications_self_select ON public.notifications
  USING ((user_id = (select auth.uid())) OR (select is_admin()));

ALTER POLICY shipment_lot_events_select ON public.shipment_lot_events
  USING (
    (select is_admin())
    OR (EXISTS (
      SELECT 1 FROM public.shipment_lots l
      JOIN public.user_roles ur ON ur.transporter_id = l.transporter_id
      WHERE l.id = shipment_lot_events.lot_id
        AND ur.user_id = (select auth.uid())
        AND ur.role = 'transporteur'
    ))
  );

ALTER POLICY shipment_lot_locations_select ON public.shipment_lot_locations
  USING (
    (select is_admin())
    OR (EXISTS (
      SELECT 1 FROM public.shipment_lots l
      JOIN public.user_roles ur ON ur.transporter_id = l.transporter_id
      WHERE l.id = shipment_lot_locations.lot_id
        AND ur.user_id = (select auth.uid())
        AND ur.role = 'transporteur'
    ))
    OR (EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.lot_id = shipment_lot_locations.lot_id
        AND s.client_user_id = (select auth.uid())
    ))
  );

ALTER POLICY incidents_insert ON public.incidents
  WITH CHECK ((reported_by = (select auth.uid())) AND can_access_shipment(shipment_id));

-- ---------------------------------------------------------------------------
-- 3. Policies permissives dupliquées sur SELECT.
--
-- Pattern répété sur 6 tables : une policy "*_admin_write" FOR ALL couvre
-- déjà SELECT en plus d'INSERT/UPDATE/DELETE, alors qu'une policy
-- "*_public_read" FOR SELECT (qual = true) existe en parallèle -> Postgres
-- évalue les deux à chaque SELECT. On restreint chaque "*_admin_write" aux
-- trois commandes d'écriture (SELECT reste couvert, pour tout le monde,
-- par la policy de lecture publique déjà en place) : aucun accès perdu ou
-- gagné, juste une seule policy évaluée sur SELECT au lieu de deux.
-- ---------------------------------------------------------------------------

DROP POLICY corridors_admin_write ON public.corridors;
CREATE POLICY corridors_admin_insert ON public.corridors FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY corridors_admin_update ON public.corridors FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY corridors_admin_delete ON public.corridors FOR DELETE USING ((select is_admin()));

DROP POLICY countries_admin_write ON public.countries;
CREATE POLICY countries_admin_insert ON public.countries FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY countries_admin_update ON public.countries FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY countries_admin_delete ON public.countries FOR DELETE USING ((select is_admin()));

DROP POLICY hubs_admin_write ON public.hubs;
CREATE POLICY hubs_admin_insert ON public.hubs FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY hubs_admin_update ON public.hubs FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY hubs_admin_delete ON public.hubs FOR DELETE USING ((select is_admin()));

DROP POLICY organizations_admin_write ON public.organizations;
CREATE POLICY organizations_admin_insert ON public.organizations FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY organizations_admin_update ON public.organizations FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY organizations_admin_delete ON public.organizations FOR DELETE USING ((select is_admin()));

DROP POLICY pickup_points_admin_write ON public.pickup_points;
CREATE POLICY pickup_points_admin_insert ON public.pickup_points FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY pickup_points_admin_update ON public.pickup_points FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY pickup_points_admin_delete ON public.pickup_points FOR DELETE USING ((select is_admin()));

DROP POLICY transporters_admin_write ON public.transporters;
CREATE POLICY transporters_admin_insert ON public.transporters FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY transporters_admin_update ON public.transporters FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY transporters_admin_delete ON public.transporters FOR DELETE USING ((select is_admin()));

-- user_roles : même chevauchement, mais avec user_roles_self_select (déjà
-- "user_id = auth.uid() OR is_admin()") au lieu d'une lecture publique —
-- ce SELECT-là couvre déjà l'admin, donc même traitement : write-only.
DROP POLICY user_roles_admin_write ON public.user_roles;
CREATE POLICY user_roles_admin_insert ON public.user_roles FOR INSERT WITH CHECK ((select is_admin()));
CREATE POLICY user_roles_admin_update ON public.user_roles FOR UPDATE USING ((select is_admin())) WITH CHECK ((select is_admin()));
CREATE POLICY user_roles_admin_delete ON public.user_roles FOR DELETE USING ((select is_admin()));

-- shipment_lots : ici les deux policies dupliquées sont deux SELECT purs
-- (admin d'un côté, transporteur titulaire du lot de l'autre), donc pas de
-- ALL à restreindre — on les fusionne en une seule policy équivalente.
DROP POLICY shipment_lots_admin_select ON public.shipment_lots;
DROP POLICY shipment_lots_transporteur_read ON public.shipment_lots;
CREATE POLICY shipment_lots_read ON public.shipment_lots FOR SELECT
  USING (
    (select is_admin())
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'transporteur'
        AND ur.transporter_id = shipment_lots.transporter_id
    ))
  );
