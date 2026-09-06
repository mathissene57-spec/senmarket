// Source unique des statuts/rôles/incidents SENLINK — doit rester en phase
// avec le CHECK constraint de shipments.status et la liste STATUSES_REQUIRING_PROOF
// côté SQL (supabase/migrations/20260829120000_senlink_init_schema.sql).

export type ShipmentStatus =
  | 'created'
  | 'dropped_off'
  | 'inspected'
  | 'departed_origin'
  | 'in_transit_international'
  | 'customs_clearance'
  | 'arrived_destination'
  | 'at_hub'
  | 'at_pickup_point'
  | 'out_for_delivery'
  | 'delivered'
  | 'incident'
  | 'cancelled'

export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  'created',
  'dropped_off',
  'inspected',
  'departed_origin',
  'in_transit_international',
  'customs_clearance',
  'arrived_destination',
  'at_hub',
  'at_pickup_point',
  'out_for_delivery',
  'delivered',
]

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: 'Créé',
  dropped_off: 'Déposé au point relais',
  inspected: 'Contrôlé',
  departed_origin: 'Départ',
  in_transit_international: 'Transit international',
  customs_clearance: 'Contrôle douanier',
  arrived_destination: 'Arrivé à destination',
  at_hub: 'Au hub',
  at_pickup_point: 'Au point relais',
  out_for_delivery: 'En cours de livraison',
  delivered: 'Livré',
  incident: 'Incident',
  cancelled: 'Annulé',
}

// Statuts critiques pour lesquels une preuve (photo ou scan QR) est exigée
// avant que record_shipment_event() n'accepte la transition (règle section 16
// du document de référence SENLINK).
export const STATUSES_REQUIRING_PROOF: ShipmentStatus[] = [
  'dropped_off',
  'inspected',
  'arrived_destination',
  'at_pickup_point',
  'delivered',
]

export type UserRole = 'client' | 'agent_point_relais' | 'transporteur' | 'admin'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  agent_point_relais: 'Agent point relais',
  transporteur: 'Transporteur',
  admin: 'Admin',
}

export type IncidentType =
  | 'colis_endommage'
  | 'colis_manquant'
  | 'retard'
  | 'probleme_douanier'
  | 'mauvaise_adresse'
  | 'destinataire_absent'
  | 'autre'

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  colis_endommage: 'Colis endommagé',
  colis_manquant: 'Colis manquant',
  retard: 'Retard',
  probleme_douanier: 'Problème douanier',
  mauvaise_adresse: 'Mauvaise adresse',
  destinataire_absent: 'Destinataire absent',
  autre: 'Autre',
}
