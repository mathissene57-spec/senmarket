-- SenLink — suivi douanier autonome (sans dépendance à un fournisseur tiers)
--
-- Décision produit (16/09/2026) : le dédouanement n'est jamais réellement
-- "récupéré en direct" par aucun agrégateur (ShipsGo/Vizion/Visiwise) --
-- leurs événements "Customs hold/release" proviennent du transporteur, qui
-- l'apprend du terminal, qui l'apprend lui-même de la douane. SenLink
-- adopte le même principe déjà en place pour le pilote MSKU7478609
-- (container_events.source = 'manual') plutôt que d'attendre l'accès API
-- d'un tiers : un correspondant SenLink (agent, transitaire partenaire, ou
-- le client lui-même) saisit directement le statut douanier dès qu'il le
-- connaît, via record_container_customs_event ci-dessous.
--
-- customs_status est une dimension VOLONTAIREMENT distincte de
-- current_status : un conteneur peut être "discharged" (position physique)
-- ET "on_hold" (statut légal douanier) en même temps -- ce sont deux axes
-- orthogonaux, jamais à conflater dans une seule colonne/CHECK.
--
-- Même conventions que les autres RPC Logistics Core : is_admin(), aucun
-- nouveau système de permission, SECURITY DEFINER + search_path='',
-- revoke public/anon puis grant authenticated seul. Testé en transaction
-- annulée avant application (admin réussit, non-admin rejeté, customs_status
-- et current_status restent indépendants) sur le conteneur pilote réel.

do $preflight$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='containers' and column_name='customs_status') then
    raise exception 'PREFLIGHT FAILED: containers.customs_status existe déjà';
  end if;
end;
$preflight$;

alter table public.containers
  add column customs_status text
  check (customs_status is null or customs_status in ('pending', 'on_hold', 'cleared'));

create function public.record_container_customs_event(
  p_container_id uuid,
  p_customs_status text,
  p_location_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_event_type text;
begin
  if not public.is_admin() then
    raise exception 'opération réservée à un administrateur';
  end if;
  if p_customs_status not in ('pending', 'on_hold', 'cleared') then
    raise exception 'statut douanier invalide : %', p_customs_status;
  end if;
  if not exists (select 1 from public.containers where id = p_container_id) then
    raise exception 'conteneur introuvable';
  end if;

  v_event_type := case p_customs_status
    when 'pending' then 'customs_pending'
    when 'on_hold' then 'customs_hold'
    when 'cleared' then 'customs_cleared'
  end;

  insert into public.container_events (container_id, event_type, location_text, source)
  values (p_container_id, v_event_type, p_location_text, 'manual')
  returning id into v_event_id;

  update public.containers set customs_status = p_customs_status where id = p_container_id;

  return v_event_id;
end;
$function$;

revoke execute on function public.record_container_customs_event(uuid, text, text) from public, anon;
grant execute on function public.record_container_customs_event(uuid, text, text) to authenticated;
