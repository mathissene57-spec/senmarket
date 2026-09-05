-- P2 (M-1, plan de finalisation V1) : reclamer_operateur() fonctionnait en
-- pure course de vitesse -- tout compte fraichement inscrit pouvait
-- reclamer n'importe quel operateur non reclame (owner_user_id null). Sans
-- risque aujourd'hui (TransAtlas et Toure transport sont deja reclames),
-- mais latent pour tout futur onboarding assiste via provisionner_operateur.
--
-- Changement strictement additif et retro-compatible : un nouveau parametre
-- optionnel p_generer_invitation (defaut false) sur provisionner_operateur,
-- et p_token optionnel (defaut null) sur reclamer_operateur. Tant que
-- personne ne demande explicitement une invitation, operateurs.invitation_
-- token reste null et reclamer_operateur() se comporte EXACTEMENT comme
-- avant (tous les appels existants -- suite de regression comprise --
-- continuent de fonctionner sans modification). Pour un vrai onboarding
-- client, provisionner_operateur(..., p_generer_invitation => true) genere
-- un token a usage unique ; reclamer_operateur exige alors ce token exact,
-- consomme (mis a null) des la premiere reclamation reussie.

alter table public.operateurs add column invitation_token uuid;

create or replace function public.provisionner_operateur(
  p_nom text,
  p_slug text,
  p_ville text,
  p_couleur_primaire text DEFAULT '#101B3D'::text,
  p_couleur_secondaire text DEFAULT '#FF7A28'::text,
  p_zones jsonb DEFAULT '[]'::jsonb,
  p_chauffeurs jsonb DEFAULT '[]'::jsonb,
  p_generer_invitation boolean DEFAULT false
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_operateur_id uuid;
  v_invitation_token uuid;
  v_zone jsonb;
  v_chauffeur jsonb;
begin
  if p_nom is null or length(trim(p_nom)) = 0 then
    raise exception 'nom requis';
  end if;
  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'slug requis';
  end if;

  if p_generer_invitation then
    v_invitation_token := gen_random_uuid();
  end if;

  insert into public.operateurs (nom, slug, ville, couleur_primaire, couleur_secondaire, actif, invitation_token)
  values (trim(p_nom), trim(p_slug), nullif(trim(p_ville), ''), coalesce(p_couleur_primaire, '#101B3D'), coalesce(p_couleur_secondaire, '#FF7A28'), true, v_invitation_token)
  returning id into v_operateur_id;

  for v_zone in select * from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb))
  loop
    if v_zone->>'nom' is null or v_zone->>'tarif_base' is null or v_zone->>'tarif_km' is null then
      raise exception 'zone invalide (nom, tarif_base, tarif_km requis) : %', v_zone;
    end if;
    insert into public.zones_operateur (operateur_id, nom, tarif_base, tarif_km)
    values (v_operateur_id, v_zone->>'nom', (v_zone->>'tarif_base')::numeric, (v_zone->>'tarif_km')::numeric);
  end loop;

  for v_chauffeur in select * from jsonb_array_elements(coalesce(p_chauffeurs, '[]'::jsonb))
  loop
    if v_chauffeur->>'nom' is null or v_chauffeur->>'telephone' is null then
      raise exception 'chauffeur invalide (nom, telephone requis) : %', v_chauffeur;
    end if;
    insert into public.chauffeurs (operateur_id, nom, telephone, vehicule, plaque, statut)
    values (v_operateur_id, v_chauffeur->>'nom', v_chauffeur->>'telephone', v_chauffeur->>'vehicule', v_chauffeur->>'plaque', 'disponible');
  end loop;

  return v_operateur_id;
end;
$function$;

create or replace function public.reclamer_operateur(p_operateur_id uuid, p_token uuid DEFAULT NULL::uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows int;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  update public.operateurs
  set owner_user_id = auth.uid(), invitation_token = null
  where id = p_operateur_id
    and owner_user_id is null
    and (invitation_token is null or invitation_token = p_token);

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;
