-- SenLink — notifie l'organisation cliente à chaque changement de statut d'un conteneur
--
-- Même pattern déjà en place pour les colis (notify_client_on_shipment_event,
-- migration 20260912210000) : la table notifications existe, la page
-- /dashboard/client/notifications la lit, mais rien n'écrivait jamais côté
-- conteneurs. channel='in_app' uniquement (WhatsApp/SMS restent hors
-- périmètre, aucune intégration Twilio/WhatsApp Cloud API).
--
-- Contrairement aux shipments (un seul client_user_id propriétaire), un
-- conteneur appartient à une ORGANISATION (containers.organization_id) et
-- peut avoir plusieurs personnes affiliées (client, org_viewer,
-- transitaire, admin via user_roles.organization_id) -- donc on notifie
-- TOUS les membres affiliés à cette organisation, pas un seul utilisateur.
--
-- Exclusion volontaire : l'auteur de l'événement (auth.uid()) n'est jamais
-- notifié de sa propre saisie -- un transitaire qui vient de saisir un
-- statut douanier n'a pas besoin qu'on lui redise ce qu'il vient de faire.
-- Absent côté shipments (l'acteur n'y est presque jamais aussi le client),
-- mais nécessaire ici car le même utilisateur peut être à la fois
-- transitaire (acteur) et destinataire naturel de la notification.
--
-- Se déclenche sur TOUT insert dans container_events, donc aussi bien les
-- événements de transport (record_container_event, admin-only aujourd'hui)
-- que les événements douaniers (record_container_customs_event, admin ou
-- transitaire) -- un seul trigger couvre les deux, pas de duplication de
-- logique. Libellés couvrant les 9 valeurs event_type réellement utilisées
-- à ce jour (pilote MSKU7478609) ; toute valeur future non listée retombe
-- sur le texte brut (event_type), jamais un libellé inventé.
--
-- Testé en transaction annulée avant application : saisie par Aissatou
-- (seule affiliée à Holding Gueye à ce jour) -> 0 notification (elle est
-- l'unique destinataire possible et c'est elle l'auteure) ; saisie par un
-- admin -> 1 notification pour Aissatou, message et container_id corrects.
-- Aucune donnée réelle affectée (rollback systématique).

do $preflight$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='container_id') then
    raise exception 'PREFLIGHT FAILED: notifications.container_id existe déjà';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_notify_org_on_container_event') then
    raise exception 'PREFLIGHT FAILED: trg_notify_org_on_container_event existe déjà';
  end if;
end;
$preflight$;

alter table public.notifications add column container_id uuid references public.containers(id);

create or replace function public.notify_org_on_container_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_container_number text;
  v_label text;
begin
  select organization_id, container_number into v_organization_id, v_container_number
  from public.containers where id = new.container_id;

  v_label := case new.event_type
    when 'empty_container_handoff' then 'Remise du conteneur vide'
    when 'gate_in' then 'Entrée au terminal'
    when 'load' then 'Chargement'
    when 'vessel_departure' then 'Départ du navire'
    when 'vessel_arrival' then 'Arrivée du navire'
    when 'discharge' then 'Déchargement'
    when 'customs_pending' then 'En attente de dédouanement'
    when 'customs_hold' then 'Bloqué en douane'
    when 'customs_cleared' then 'Dédouané'
    else new.event_type
  end;

  insert into public.notifications (user_id, container_id, channel, type, message, status, sent_at)
  select distinct ur.user_id, new.container_id, 'in_app', 'container_status_update',
    format('Conteneur %s : %s', v_container_number, v_label), 'sent', now()
  from public.user_roles ur
  where ur.organization_id = v_organization_id
    and ur.user_id is distinct from auth.uid();

  return new;
end;
$function$;

create trigger trg_notify_org_on_container_event
after insert on public.container_events
for each row execute function public.notify_org_on_container_event();
