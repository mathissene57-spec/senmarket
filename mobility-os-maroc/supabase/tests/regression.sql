-- Suite de tests de regression : RPC de dispatch, trigger de note, pricing
-- serveur, timeout dispatch, et permissions (chauffeurs/avis/courses).
--
-- Auto-nettoyante par construction : tout tourne dans une transaction annulee
-- a la fin (ROLLBACK), donc aucune donnee de test ne persiste dans la base
-- de demo/production, meme si un test echoue avant la fin du script (un
-- echec non rattrape a l'interieur d'une transaction Postgres l'annule
-- automatiquement).
--
-- Reecrite le 2026-09-02 suite a la migration de durcissement P0 (securite,
-- pricing serveur, timeout) : les anciennes signatures de creer_course et
-- noter_course ont change, l'ancienne policy d'ecriture ouverte sur
-- chauffeurs et d'insertion ouverte sur avis_courses ont ete supprimees.
--
-- A executer dans le SQL Editor du projet Supabase (hfybtcyhhzgwirtqdqmt),
-- ou via `psql <connection string> -f regression.sql`. Sortie attendue :
-- une ligne "OK: ..." par test, puis "TOUS LES TESTS RPC SONT PASSES".
-- Toute ligne "FAIL: ..." ou erreur Postgres signale une regression reelle.

begin;

do $$
declare
  v_operateur_id uuid;
  v_zone_id uuid;
  v_chauffeur1_id uuid;
  v_chauffeur2_id uuid;
  v_course_id uuid;
  v_course2_id uuid;
  v_result boolean;
  v_statut text;
  v_note_moyenne numeric;
  v_prix numeric;
  v_distance numeric;
  v_prix_proche numeric;
  v_prix_loin numeric;
begin
  -- Provisionnement d'un operateur de test isole (slug unique a chaque run)
  v_operateur_id := provisionner_operateur(
    'Test Suite', 'test-suite-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff',
    '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    '[{"nom":"Chauffeur A","telephone":"0700000001"},{"nom":"Chauffeur B","telephone":"0700000002"}]'::jsonb
  );
  select id into v_zone_id from zones_operateur where operateur_id = v_operateur_id;
  select id into v_chauffeur1_id from chauffeurs where operateur_id = v_operateur_id and telephone = '0700000001';
  select id into v_chauffeur2_id from chauffeurs where operateur_id = v_operateur_id and telephone = '0700000002';

  -- Test 1 : creer_course cree bien une course en_recherche, prix calcule serveur
  select id, prix_estime, distance_km into v_course_id, v_prix, v_distance
  from creer_course(v_operateur_id, '0711111111', 'Client Test', 'Depart', 'Arrivee', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  select statut into v_statut from courses where id = v_course_id;
  if v_statut is distinct from 'en_recherche' then
    raise exception 'FAIL test 1 (creer_course): statut initial attendu en_recherche, obtenu %', v_statut;
  end if;
  if v_prix is distinct from round((10 + 2 * v_distance)::numeric, 2) then
    raise exception 'FAIL test 1 (creer_course): prix % incoherent avec la distance calculee % (attendu %)', v_prix, v_distance, round((10 + 2 * v_distance)::numeric, 2);
  end if;
  raise notice 'OK test 1: creer_course (prix serveur = % DH pour % km)', v_prix, round(v_distance, 2);

  -- Test 1b : un trajet plus long produit un prix plus eleve (le prix suit la vraie distance)
  select prix_estime into v_prix_proche
  from creer_course(v_operateur_id, '0711111111', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  select prix_estime into v_prix_loin
  from creer_course(v_operateur_id, '0711111111', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 34.0209, -6.8416); -- ~Rabat
  if v_prix_loin <= v_prix_proche then
    raise exception 'FAIL test 1b (creer_course): un trajet plus long (%) devrait couter plus qu''un trajet court (%)', v_prix_loin, v_prix_proche;
  end if;
  raise notice 'OK test 1b: le prix suit la distance reelle (court=% DH, long=% DH)', v_prix_proche, v_prix_loin;

  -- Test 2 : premier accepter_course gagne
  v_result := accepter_course(v_course_id, v_chauffeur1_id);
  if v_result is not true then
    raise exception 'FAIL test 2 (accepter_course): le premier appel aurait du reussir';
  end if;
  raise notice 'OK test 2: accepter_course (premier appelant) reussit';

  -- Test 3 : deuxieme accepter_course sur la meme course echoue (verrou optimiste)
  v_result := accepter_course(v_course_id, v_chauffeur2_id);
  if v_result is not false then
    raise exception 'FAIL test 3 (accepter_course): le deuxieme appel aurait du echouer (concurrence)';
  end if;
  raise notice 'OK test 3: concurrence a l''acceptation bloquee correctement';

  -- Test 4 : transition invalide rejetee (assignee -> terminee, en sautant en_cours)
  begin
    perform avancer_course(v_course_id, 'terminee');
    raise exception 'FAIL test 4 (avancer_course): transition assignee->terminee aurait du etre rejetee';
  exception when others then
    if sqlerrm like 'Transition invalide%' then
      raise notice 'OK test 4: transition invalide rejetee (%)', sqlerrm;
    else
      raise;
    end if;
  end;

  -- Test 5 : transitions valides jusqu'au bout
  perform avancer_course(v_course_id, 'en_cours');
  perform avancer_course(v_course_id, 'terminee');
  select statut into v_statut from courses where id = v_course_id;
  if v_statut is distinct from 'terminee' then
    raise exception 'FAIL test 5 (avancer_course): statut final attendu terminee, obtenu %', v_statut;
  end if;
  raise notice 'OK test 5: transitions valides (assignee -> en_cours -> terminee)';

  -- Test 6 : noter_course exige le telephone du passager de la course
  begin
    perform noter_course(v_course_id, '0799999999', 4, 'mauvais telephone');
    raise exception 'FAIL test 6a (noter_course): un telephone qui n''est pas celui du passager aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Course introuvable%' then
      raise notice 'OK test 6a: noter_course rejette un telephone qui ne correspond pas au passager';
    else
      raise;
    end if;
  end;
  perform noter_course(v_course_id, '0711111111', 4, 'test');
  perform noter_course(v_course_id, '0711111111', 2, 'test');
  select note_moyenne into v_note_moyenne from chauffeurs where id = v_chauffeur1_id;
  if v_note_moyenne is distinct from 3.0 then
    raise exception 'FAIL test 6b (trigger recalculer_note_chauffeur): moyenne attendue 3.0, obtenue %', v_note_moyenne;
  end if;
  raise notice 'OK test 6b: trigger recalculer_note_chauffeur ((4+2)/2 = 3.0)';

  -- Test 7 : annuler_course marque bien la course annulee
  select id into v_course2_id from creer_course(v_operateur_id, '0722222222', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  perform annuler_course(v_course2_id);
  select statut into v_statut from courses where id = v_course2_id;
  if v_statut is distinct from 'annulee' then
    raise exception 'FAIL test 7 (annuler_course): statut attendu annulee, obtenu %', v_statut;
  end if;
  raise notice 'OK test 7: annuler_course';

  -- Test 8 : historique_passager renvoie la course terminee du bon passager
  if not exists (select 1 from historique_passager('0711111111') where id = v_course_id) then
    raise exception 'FAIL test 8 (historique_passager): course terminee attendue absente du resultat';
  end if;
  raise notice 'OK test 8: historique_passager';

  -- Test 9 : timeout dispatch (P0.4) : une course en_recherche trop ancienne
  -- bascule sur sans_chauffeur une fois expirer_courses_en_recherche() execute.
  select id into v_course2_id from creer_course(v_operateur_id, '0733333333', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  update courses set created_at = now() - interval '5 minutes' where id = v_course2_id;
  perform expirer_courses_en_recherche();
  select statut into v_statut from courses where id = v_course2_id;
  if v_statut is distinct from 'sans_chauffeur' then
    raise exception 'FAIL test 9 (expirer_courses_en_recherche): statut attendu sans_chauffeur, obtenu %', v_statut;
  end if;
  raise notice 'OK test 9: timeout dispatch bascule bien en sans_chauffeur';

  -- Test 10 : connexion_chauffeur retrouve le bon chauffeur par telephone
  if not exists (select 1 from connexion_chauffeur(v_operateur_id, '0700000001') where id = v_chauffeur1_id) then
    raise exception 'FAIL test 10 (connexion_chauffeur): chauffeur attendu introuvable';
  end if;
  raise notice 'OK test 10: connexion_chauffeur';

  -- Test 11 : definir_disponibilite_chauffeur exige le bon telephone
  v_result := definir_disponibilite_chauffeur(v_chauffeur2_id, '0000000000', 'indisponible');
  if v_result is not false then
    raise exception 'FAIL test 11a (definir_disponibilite_chauffeur): mauvais telephone aurait du echouer';
  end if;
  v_result := definir_disponibilite_chauffeur(v_chauffeur2_id, '0700000002', 'indisponible');
  if v_result is not true then
    raise exception 'FAIL test 11b (definir_disponibilite_chauffeur): bon telephone aurait du reussir';
  end if;
  raise notice 'OK test 11: definir_disponibilite_chauffeur verifie bien le telephone';

  raise notice 'TOUS LES TESTS RPC SONT PASSES';
end $$;

-- Tests de permissions : simule un vrai appel public (role anon), comme un
-- appel REST non authentifie depuis le navigateur.
set role anon;
do $$
begin
  begin
    insert into passagers (telephone) values ('0799999999');
    raise exception 'FAIL (permissions): insert direct sur passagers aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: insert direct sur passagers bloque pour anon';
  end;

  begin
    insert into avis_courses (course_id, note) values (gen_random_uuid(), 5);
    raise exception 'FAIL (permissions): insert direct sur avis_courses aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: insert direct sur avis_courses bloque pour anon';
  end;

  begin
    update chauffeurs set statut = 'disponible' where true;
    raise exception 'FAIL (permissions): update direct sur chauffeurs aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: update direct sur chauffeurs bloque pour anon';
  end;

  begin
    perform telephone from chauffeurs limit 1;
    raise exception 'FAIL (permissions): lecture directe de chauffeurs.telephone aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: lecture directe de chauffeurs.telephone bloquee pour anon';
  end;

  begin
    perform provisionner_operateur('x', 'x', 'x', null, null, '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL (permissions): provisionner_operateur aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: provisionner_operateur bloque pour anon';
  end;

  raise notice 'TOUS LES TESTS DE PERMISSIONS SONT PASSES';
end $$;
reset role;

rollback;
