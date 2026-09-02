-- P0.1 + P0.2 -- correctifs de securite issus de l'audit Phase 0 du
-- 2026-09-02, confirmes exploitables par des tests en direct sur la
-- production (transactions annulees, aucune donnee reelle touchee) avant
-- correction. Applique directement sur hfybtcyhhzgwirtqdqmt via
-- mcp__Supabase__apply_migration ; ce fichier n'est que la trace locale du
-- meme changement, pour la revue de code et le git diff.

-- P0.1 : accepter_course ne verifiait jamais que le chauffeur appartient au
-- meme operateur que la course. Preuve : un chauffeur reel de TransAtlas a
-- pu accepter une course de test creee pour un autre operateur reel
-- ("Casa Rapide") -- rupture directe de l'isolation multi-tenant. Corrige
-- par une verification croisee chauffeurs.operateur_id = courses.operateur_id,
-- ajoutee avant la mise a jour, sans toucher au reste (correspondance
-- telephone, verification OTP, verrou atomique par UPDATE conditionnel --
-- tous deja corrects et inchanges).
create or replace function public.accepter_course(p_course_id uuid, p_chauffeur_id uuid, p_telephone text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows int;
begin
  if not exists (select 1 from public.chauffeurs where id = p_chauffeur_id and telephone = trim(p_telephone)) then
    raise exception 'Telephone ne correspond pas au chauffeur';
  end if;

  if not public.est_telephone_verifie(trim(p_telephone)) then
    raise exception 'Numero de telephone non verifie. Veuillez confirmer votre code de verification.';
  end if;

  if not exists (
    select 1
    from public.chauffeurs ch
    join public.courses c on c.id = p_course_id
    where ch.id = p_chauffeur_id and ch.operateur_id = c.operateur_id
  ) then
    raise exception 'Ce chauffeur n''appartient pas a l''operateur de cette course';
  end if;

  update public.courses
  set chauffeur_id = p_chauffeur_id, statut = 'assignee', assignee_at = now()
  where id = p_course_id and statut = 'en_recherche';

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.chauffeurs set statut = 'en_course' where id = p_chauffeur_id;
    return true;
  end if;

  return false;
end;
$function$;

-- P0.2 : la policy courses_lecture_recente n'avait aucun filtre par
-- operateur_id (uniquement created_at > now() - 6h), accordee a la fois a
-- anon et authenticated. Preuve : un role anon pur (sans jeton) pouvait lire
-- l'integralite des courses de tous les operateurs des 6 dernieres heures
-- (adresses, prix, statuts) -- exposition confirmee en direct.
--
-- L'application n'utilise jamais cette policy directement (dashboard/admin
-- passent par courses_operateur()/chauffeurs_operateur(), SECURITY DEFINER,
-- deja correctement cloisonnees). Les apps passager et chauffeur, en
-- revanche, n'ont jamais de session Supabase Auth (identite portee par
-- OTP/telephone, pas par auth.uid()) et dependent de cette meme policy pour
-- leurs abonnements Realtime (nouvelle course proposee au chauffeur, mise a
-- jour de statut cote passager) -- supprimer purement la policy casserait
-- donc le dispatch temps reel, explicitement hors perimetre de ce correctif
-- ("ne pas modifier le dispatch").
--
-- Reduction au strict necessaire :
--   - role authenticated retire (jamais utilise pour cet usage) ;
--   - lecture limitee aux courses encore actives (en_recherche/assignee/
--     en_cours) -- une course terminee, annulee ou sans_chauffeur n'a plus
--     aucune raison d'etre diffusee publiquement.
--
-- Limite assumee et documentee (voir rapport d'audit) : une course active
-- reste visible par un client anon non lie a cette course, tant qu'aucune
-- identite de session n'existe pour les chauffeurs/passagers. Fermeture
-- complete hors perimetre de ce correctif P0 -- necessiterait une identite
-- de session (token scope par chauffeur/passager) ou le passage a Realtime
-- Broadcast + Authorization, un changement d'architecture a part entiere.
drop policy if exists courses_lecture_recente on public.courses;

create policy courses_lecture_recente
on public.courses
for select
to anon
using (
  statut in ('en_recherche', 'assignee', 'en_cours')
  and created_at > now() - interval '6 hours'
);
