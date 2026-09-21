-- SenLink CRM — Phase 1 (Team CRM) : coordination de l'équipe SenLink
--
-- Demandé (21/09/2026) : un CRM interne pour l'équipe SenLink (4
-- personnes), distinct du Logistics Core (qui reste la source de vérité
-- opérationnelle sur les expéditions/conteneurs). Objet : "qui fait quoi,
-- avec quel partenaire, où en est la relation, quelle est la prochaine
-- action, qu'est-ce qui bloque" — pas remplacer le tracking.
--
-- Portée volontairement réduite à la Phase 1 du plan validé (équipe,
-- organisations/contacts génériques, tâches, activités) -- PAS les
-- modules Transporteurs/Transitaires/Partenaires avec pipeline de
-- qualification (Phase 2), ni Expéditions/Incidents liés au Logistics
-- Core (Phase 3), ni KPI/connaissance/décisions (Phase 4). Conforme à la
-- discipline déjà en place dans ce repo : pas de grosse architecture
-- avant validation terrain, une seule table de plus si un besoin réel
-- apparaît, jamais 15 tables d'un coup.
--
-- Schéma autonome de SenMarket (même principe que tout le reste de
-- senlink/), mais dans le MÊME projet Supabase que le Logistics Core
-- (préfixe crm_ plutôt qu'un projet séparé) -- les objets CRM référencent
-- déjà auth.users/profiles, et référenceront plus tard organizations/
-- transporters quand les phases suivantes en auront besoin.
--
-- Rôles CRM (crm_team_members.crm_role) volontairement DISTINCTS des
-- rôles opérationnels SenLink (user_roles.role: transitaire/org_viewer/
-- etc.) -- appartenance à l'équipe CRM interne, rien à voir avec les
-- organisations clientes du Logistics Core.
--
-- Modèle d'accès V1, volontairement simple pour une équipe de 4 personnes
-- qui se fait confiance : tout membre CRM (is_crm_team_member()) peut
-- lire/écrire toutes les tables CRM -- pas de cloisonnement par rôle
-- (direction/business/logistics/transporter_relations) au niveau RLS pour
-- l'instant, ce cloisonnement plus fin n'est qu'une préférence d'affichage
-- (chaque dashboard filtre ce qu'il montre) tant qu'aucune friction réelle
-- ne justifie une restriction en base. DELETE réservé à l'admin sur
-- toutes les tables (filet de sécurité contre une suppression accidentelle).
--
-- Testé en transaction annulée avant application : admin s'affecte
-- 'direction' via admin_assign_crm_role, écrit dans crm_organizations,
-- admin_list_crm_team renvoie la liste jointe (email/nom/rôle) ;
-- utilisateur non-membre CRM rejeté en écriture. Aucune donnée réelle
-- affectée (rollback systématique).

do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='crm_team_members') then
    raise exception 'PREFLIGHT FAILED: crm_team_members existe déjà';
  end if;
end;
$preflight$;

create table public.crm_team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  crm_role text not null check (crm_role in ('direction','business','logistics','transporter_relations')),
  created_at timestamptz not null default now()
);
alter table public.crm_team_members enable row level security;

create function public.is_crm_team_member()
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.crm_team_members where user_id = auth.uid());
$$;

create policy crm_team_members_self_select on public.crm_team_members
  for select using (user_id = (select auth.uid()) or (select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_team_members_admin_insert on public.crm_team_members
  for insert with check ((select public.is_admin()));
create policy crm_team_members_admin_update on public.crm_team_members
  for update using ((select public.is_admin())) with check ((select public.is_admin()));
create policy crm_team_members_admin_delete on public.crm_team_members
  for delete using ((select public.is_admin()));

create table public.crm_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('transporteur','transitaire','client_prospect','partenaire','autre')),
  country text,
  responsable_user_id uuid references auth.users(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_organizations enable row level security;
create trigger trg_crm_organizations_updated_at before update on public.crm_organizations
  for each row execute function public.set_updated_at();
create policy crm_organizations_team_select on public.crm_organizations
  for select using ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_organizations_team_insert on public.crm_organizations
  for insert with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_organizations_team_update on public.crm_organizations
  for update using ((select public.is_admin()) or (select public.is_crm_team_member()))
  with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_organizations_admin_delete on public.crm_organizations
  for delete using ((select public.is_admin()));

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  crm_organization_id uuid references public.crm_organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp text,
  email text,
  role_title text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.crm_contacts enable row level security;
create policy crm_contacts_team_select on public.crm_contacts
  for select using ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_contacts_team_insert on public.crm_contacts
  for insert with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_contacts_team_update on public.crm_contacts
  for update using ((select public.is_admin()) or (select public.is_crm_team_member()))
  with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_contacts_admin_delete on public.crm_contacts
  for delete using ((select public.is_admin()));

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  crm_organization_id uuid references public.crm_organizations(id) on delete set null,
  responsable_user_id uuid not null references auth.users(id),
  type text,
  priority text not null default 'moyenne' check (priority in ('basse','moyenne','haute')),
  due_date date,
  status text not null default 'a_faire' check (status in ('a_faire','en_cours','bloque','termine','annule')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_tasks enable row level security;
create trigger trg_crm_tasks_updated_at before update on public.crm_tasks
  for each row execute function public.set_updated_at();
create policy crm_tasks_team_select on public.crm_tasks
  for select using ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_tasks_team_insert on public.crm_tasks
  for insert with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_tasks_team_update on public.crm_tasks
  for update using ((select public.is_admin()) or (select public.is_crm_team_member()))
  with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_tasks_admin_delete on public.crm_tasks
  for delete using ((select public.is_admin()));

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  crm_organization_id uuid references public.crm_organizations(id) on delete set null,
  crm_contact_id uuid references public.crm_contacts(id) on delete set null,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('appel','whatsapp','email','rencontre','visite_terrain','reunion','demonstration','test','note_interne')),
  result_text text,
  next_action_text text,
  next_action_date date,
  created_at timestamptz not null default now()
);
alter table public.crm_activities enable row level security;
create policy crm_activities_team_select on public.crm_activities
  for select using ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_activities_team_insert on public.crm_activities
  for insert with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_activities_team_update on public.crm_activities
  for update using ((select public.is_admin()) or (select public.is_crm_team_member()))
  with check ((select public.is_admin()) or (select public.is_crm_team_member()));
create policy crm_activities_admin_delete on public.crm_activities
  for delete using ((select public.is_admin()));

create or replace function public.admin_assign_crm_role(p_email text, p_crm_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_user_id uuid;
  v_row_id uuid;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;
  if p_crm_role not in ('direction','business','logistics','transporter_relations') then
    raise exception 'rôle CRM invalide : %', p_crm_role;
  end if;
  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_target_user_id is null then
    raise exception 'aucun compte SenLink trouvé pour cet email — cette personne doit d''abord créer un compte';
  end if;
  insert into public.crm_team_members (user_id, crm_role)
  values (v_target_user_id, p_crm_role)
  on conflict (user_id) do update set crm_role = excluded.crm_role
  returning id into v_row_id;
  return v_row_id;
end;
$function$;

create or replace function public.admin_list_crm_team()
returns table(user_id uuid, email text, full_name text, crm_role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_admin() or public.is_crm_team_member()) then
    raise exception 'opération réservée à l''équipe SenLink';
  end if;
  return query
  select tm.user_id, u.email::text, p.full_name, tm.crm_role, tm.created_at
  from public.crm_team_members tm
  join auth.users u on u.id = tm.user_id
  left join public.profiles p on p.id = tm.user_id
  order by tm.created_at asc;
end;
$function$;

revoke execute on function public.admin_assign_crm_role(text, text) from public, anon;
grant execute on function public.admin_assign_crm_role(text, text) to authenticated;
revoke execute on function public.admin_list_crm_team() from public, anon;
grant execute on function public.admin_list_crm_team() to authenticated;
