-- Suite de tests de regression : RPC de dispatch, trigger de note, et permissions.
--
-- Auto-nettoyante par construction : tout tourne dans une transaction annulee
-- a la fin (ROLLBACK), donc aucune donnee de test ne persiste dans la base
-- de demo/production, meme si un test echoue avant la fin du script (un
-- echec non rattrape a l'interieur d'une transaction Postgres l'annule
-- automatiquement).
--
-- A executer dans le SQL Editor du projet Supabase (hfybtcyhhzgwirtqdqmt),
-- ou via `psql <connection string> -f regression.sql`. Sortie attendue :
-- une ligne "OK: ..." par test, puis "TOUS LES TESTS RPC SONT PASSES".
-- Toute ligne "FAIL: ..." ou erreur Postgres signale une regression reelle.

begin;

do $$
declare
  v_operateur_id uuid;
  v_chauffeur1_id uuid;
  v_chauffeur2_id uuid;
  v_course_id uuid;
  v_course2_id uuid;
  v_result boolean;
  v_statut text;
  v_note_moyenne numeric;
begin
  -- Provisionnement d'un operateur de test isole (slug unique a chaque run)
  v_operateur_id := provisionner_operateur(
    'Test Suite', 'test-suite-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff',
    '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    '[{"nom":"Chauffeur A","telephone":"0700000001"},{"nom":"Chauffeur B","telephone":"0700000002"}]'::jsonb
  );
  select id into v_chauffeur1_id from chauffeurs where operateur_id = v_operateur_id and telephone = '0700000001';
  select id into v_chauffeur2_id from chauffeurs where operateur_id = v_operateur_id and telephone = '0700000002';

  -- Test 1 : creer_course cree bien une course en_recherche
  v_course_id := creer_course(v_operateur_id, '0711111111', 'Client Test', 'Depart', 'Arrivee', 42.5);
  select statut into v_statut from courses where id = v_course_id;
  if v_statut is distinct from 'en_recherche' then
    raise exception 'FAIL test 1 (creer_course): statut initial attendu en_recherche, obtenu %', v_statut;
  end if;
  raise notice 'OK test 1: creer_course';

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

  -- Test 6 : noter_course alimente avis_courses et le trigger recalcule note_moyenne
  perform noter_course(v_course_id, 4, 'test');
  perform noter_course(v_course_id, 2, 'test');
  select note_moyenne into v_note_moyenne from chauffeurs where id = v_chauffeur1_id;
  if v_note_moyenne is distinct from 3.0 then
    raise exception 'FAIL test 6 (trigger recalculer_note_chauffeur): moyenne attendue 3.0, obtenue %', v_note_moyenne;
  end if;
  raise notice 'OK test 6: trigger recalculer_note_chauffeur ((4+2)/2 = 3.0)';

  -- Test 7 : annuler_course marque bien la course annulee
  v_course2_id := creer_course(v_operateur_id, '0722222222', null, 'D', 'A', 15);
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
    perform provisionner_operateur('x', 'x', 'x', null, null, '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL (permissions): provisionner_operateur aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: provisionner_operateur bloque pour anon';
  end;

  raise notice 'TOUS LES TESTS DE PERMISSIONS SONT PASSES';
end $$;
reset role;

rollback;
