export type CrmRole = 'direction' | 'business' | 'logistics' | 'transporter_relations' | 'legal'

export const CRM_ROLE_LABELS: Record<CrmRole, string> = {
  direction: 'Direction',
  business: 'Développement / Relations',
  logistics: 'Logistique / Transit',
  transporter_relations: 'Relations Transporteurs',
  legal: 'Juridique',
}

export type MembreCrm = {
  user_id: string
  email: string
  full_name: string | null
  crm_role: CrmRole
  created_at: string
}
