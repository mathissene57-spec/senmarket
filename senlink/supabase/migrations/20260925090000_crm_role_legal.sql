-- SenLink CRM Phase 1 — ajoute le rôle 'legal' (juridique) manquant.
-- Aucun des 4 rôles initiaux (direction/business/logistics/
-- transporter_relations, 20260921100000) ne couvre le juridique, alors que
-- c'est une fonction réelle et distincte dans l'équipe (formalisation
-- légale/licensing de la branche livraison, contrats transporteurs/points
-- relais, etc.).

do $preflight$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_team_members'::regclass
      and conname = 'crm_team_members_crm_role_check'
      and pg_get_constraintdef(oid) ilike '%legal%'
  ) then
    raise exception 'PREFLIGHT FAILED: le rôle legal existe déjà';
  end if;
end;
$preflight$;

alter table public.crm_team_members drop constraint crm_team_members_crm_role_check;
alter table public.crm_team_members add constraint crm_team_members_crm_role_check
  check (crm_role in ('direction', 'business', 'logistics', 'transporter_relations', 'legal'));
