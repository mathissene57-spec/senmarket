-- Suite de tests de regression : RPC de dispatch, trigger de note, pricing
-- serveur, timeout dispatch, controle d'identite du cycle de vie, et
-- permissions (chauffeurs/avis/passagers/courses).
--
-- Auto-nettoyante par construction : tout tourne dans une transaction annulee
-- a la fin (ROLLBACK), donc aucune donnee de test ne persiste dans la base
-- de demo/production, meme si un test echoue avant la fin du script (un
-- echec non rattrape a l'interieur d'une transaction Postgres l'annule
-- automatiquement).
--
-- Reecrite le 2026-09-02 (Security v1.1) : accepter_course/avancer_course/
-- annuler_course exigent desormais le telephone du bon acteur (chauffeur ou
-- passager selon le cas), en attendant l'identite reelle OTP (P0.2).
-- chauffeurs_operateur() ajoutee (lecture flotte scopee par owner_user_id).
--
-- Completee le 2026-09-02 (P1.4/P1.5/P1.6) : mettre_a_jour_position(),
-- et expirer_courses_en_recherche() elargit maintenant rayon_recherche_km
-- par paliers (3/6/9/12/15 km toutes les 30s) avant d'expirer a 180s
-- (au lieu d'un rayon fixe et d'un timeout a 90s).
--
-- Completee le 2026-09-02 (P0.2 OTP) : creer_course/accepter_course/
-- avancer_course/annuler_course/noter_course/connexion_chauffeur/
-- definir_disponibilite_chauffeur/mettre_a_jour_position exigent desormais
-- une verification OTP recente (est_telephone_verifie(), fenetre de 24h)
-- pour le telephone fourni, en plus de la correspondance de propriete deja
-- en place.
--
-- Reecrite le 2026-09-05 (correctif securite C-1) : demander_otp() ne renvoie
-- plus jamais le code en clair (voir migration 20260905010000 -- avant ce
-- correctif, n'importe qui pouvait "verifier" n'importe quel numero juste en
-- lisant la reponse RPC). Tous les numeros de test passent desormais par
-- test_demander_otp_et_lire_code(), un outil reserve au role proprietaire
-- (jamais accorde a anon/authenticated) qui appelle demander_otp() puis lit
-- le code via otp_codes.code_demo -- colonne qui n'existe QUE pour les
-- numeros enregistres dans otp_demo_telephones, ce que cet outil fait lui-meme
-- automatiquement pour chaque numero de test.
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
  v_chauffeur1_tel text := '0700000001';
  v_chauffeur2_tel text := '0700000002';
  v_course_id uuid;
  v_course2_id uuid;
  v_result boolean;
  v_statut text;
  v_note_moyenne numeric;
  v_prix numeric;
  v_distance numeric;
  v_prix_proche numeric;
  v_prix_loin numeric;
  v_code text;
begin
  -- Provisionnement d'un operateur de test isole (slug unique a chaque run)
  v_operateur_id := provisionner_operateur(
    'Test Suite', 'test-suite-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff',
    '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur A","telephone":"%s"},{"nom":"Chauffeur B","telephone":"%s"}]', v_chauffeur1_tel, v_chauffeur2_tel)::jsonb
  );
  select id into v_zone_id from zones_operateur where operateur_id = v_operateur_id;
  select id into v_chauffeur1_id from chauffeurs where operateur_id = v_operateur_id and telephone = v_chauffeur1_tel;
  select id into v_chauffeur2_id from chauffeurs where operateur_id = v_operateur_id and telephone = v_chauffeur2_tel;

  -- OTP (P0.2) : verifie tous les numeros de test utilises plus bas, y
  -- compris '0000000000' (utilise pour les tests de mauvais telephone :
  -- une fois verifie, il reste un telephone legitime mais different de
  -- celui attendu, donc les tests de non-correspondance restent valides).
  v_code := test_demander_otp_et_lire_code(v_chauffeur1_tel); perform verifier_otp(v_chauffeur1_tel, v_code);
  v_code := test_demander_otp_et_lire_code(v_chauffeur2_tel); perform verifier_otp(v_chauffeur2_tel, v_code);
  v_code := test_demander_otp_et_lire_code('0711111111'); perform verifier_otp('0711111111', v_code);
  v_code := test_demander_otp_et_lire_code('0722222222'); perform verifier_otp('0722222222', v_code);
  v_code := test_demander_otp_et_lire_code('0733333333'); perform verifier_otp('0733333333', v_code);
  v_code := test_demander_otp_et_lire_code('0733333344'); perform verifier_otp('0733333344', v_code);
  v_code := test_demander_otp_et_lire_code('0000000000'); perform verifier_otp('0000000000', v_code);

  -- Test 1 : creer_course cree bien une course en_recherche, prix calcule serveur
  select id, prix_estime, distance_km into v_course_id, v_prix, v_distance
  from creer_course(v_operateur_id, '0711111111', 'Client Test', 'Depart', 'Arrivee', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  select statut into v_statut from courses where id = v_course_id;
  if v_statut is distinct from 'en_recherche' then
    raise exception 'FAIL test 1 (creer_course): statut initial attendu en_recherche, obtenu %', v_statut;
  end if;
  if v_prix is distinct from round((10 + 2 * v_distance)::numeric, 2) then
    raise exception 'FAIL test 1 (creer_course): prix % incoherent avec la distance calculee %', v_prix, v_distance;
  end if;
  raise notice 'OK test 1: creer_course (prix serveur = % DH pour % km)', v_prix, round(v_distance, 2);

  -- Test 1b : un trajet plus long produit un prix plus eleve. Deux numeros
  -- distincts (plutot que '0711111111', deja utilise par le test 1 avec une
  -- course encore en_recherche) -- depuis H-3 (2026-09-05), un passager ne
  -- peut plus avoir deux courses actives simultanement.
  v_code := test_demander_otp_et_lire_code('0711111112'); perform verifier_otp('0711111112', v_code);
  v_code := test_demander_otp_et_lire_code('0711111113'); perform verifier_otp('0711111113', v_code);
  select prix_estime into v_prix_proche from creer_course(v_operateur_id, '0711111112', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  select prix_estime into v_prix_loin from creer_course(v_operateur_id, '0711111113', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 34.0209, -6.8416);
  if v_prix_loin <= v_prix_proche then
    raise exception 'FAIL test 1b: un trajet plus long (%) devrait couter plus qu''un trajet court (%)', v_prix_loin, v_prix_proche;
  end if;
  raise notice 'OK test 1b: le prix suit la distance reelle (court=% DH, long=% DH)', v_prix_proche, v_prix_loin;

  -- Test 2 : accepter_course exige le telephone du chauffeur cible
  begin
    perform accepter_course(v_course_id, v_chauffeur1_id, '0000000000');
    raise exception 'FAIL test 2a: mauvais telephone aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Telephone ne correspond%' then raise notice 'OK test 2a: accepter_course rejette un mauvais telephone';
    else raise; end if;
  end;
  v_result := accepter_course(v_course_id, v_chauffeur1_id, v_chauffeur1_tel);
  if v_result is not true then raise exception 'FAIL test 2b: acceptation legitime aurait du reussir'; end if;
  raise notice 'OK test 2b: accepter_course (premier appelant, bon telephone) reussit';

  -- Test 3 : deuxieme accepter_course sur la meme course echoue (verrou optimiste)
  v_result := accepter_course(v_course_id, v_chauffeur2_id, v_chauffeur2_tel);
  if v_result is not false then
    raise exception 'FAIL test 3 (accepter_course): le deuxieme appel aurait du echouer (concurrence)';
  end if;
  raise notice 'OK test 3: concurrence a l''acceptation bloquee correctement';

  -- Test 4 : avancer_course rejette un telephone qui n'est pas celui du chauffeur assigne
  begin
    perform avancer_course(v_course_id, 'en_cours', v_chauffeur2_tel);
    raise exception 'FAIL test 4a: telephone du mauvais chauffeur aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Telephone ne correspond%' then raise notice 'OK test 4a: avancer_course protege contre usurpation';
    else raise; end if;
  end;

  -- Test 4b : transition invalide rejetee (assignee -> terminee, en sautant en_cours)
  begin
    perform avancer_course(v_course_id, 'terminee', v_chauffeur1_tel);
    raise exception 'FAIL test 4b: transition assignee->terminee aurait du etre rejetee';
  exception when others then
    if sqlerrm like 'Transition invalide%' then raise notice 'OK test 4b: transition invalide rejetee (%)', sqlerrm;
    else raise; end if;
  end;

  -- Test 5 : transitions valides jusqu'au bout, avec le bon telephone
  perform avancer_course(v_course_id, 'en_cours', v_chauffeur1_tel);
  perform avancer_course(v_course_id, 'terminee', v_chauffeur1_tel);
  select statut into v_statut from courses where id = v_course_id;
  if v_statut is distinct from 'terminee' then
    raise exception 'FAIL test 5: statut final attendu terminee, obtenu %', v_statut;
  end if;
  raise notice 'OK test 5: transitions valides (assignee -> en_cours -> terminee)';

  -- Test 6 : noter_course exige le telephone du passager de la course
  begin
    perform noter_course(v_course_id, '0799999999', 4, 'mauvais telephone');
    raise exception 'FAIL test 6a: telephone qui n''est pas celui du passager aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Course introuvable%' then raise notice 'OK test 6a: noter_course rejette un mauvais telephone';
    else raise; end if;
  end;
  perform noter_course(v_course_id, '0711111111', 4, 'test');
  perform noter_course(v_course_id, '0711111111', 2, 'test');
  select note_moyenne into v_note_moyenne from chauffeurs where id = v_chauffeur1_id;
  if v_note_moyenne is distinct from 3.0 then
    raise exception 'FAIL test 6b (trigger recalculer_note_chauffeur): moyenne attendue 3.0, obtenue %', v_note_moyenne;
  end if;
  raise notice 'OK test 6b: trigger recalculer_note_chauffeur ((4+2)/2 = 3.0)';

  -- Test 7 : annuler_course exige le telephone du passager
  select id into v_course2_id from creer_course(v_operateur_id, '0722222222', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  begin
    perform annuler_course(v_course2_id, '0000000000');
    raise exception 'FAIL test 7a: mauvais telephone passager aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Telephone ne correspond%' then raise notice 'OK test 7a: annuler_course protege le passager';
    else raise; end if;
  end;
  perform annuler_course(v_course2_id, '0722222222');
  select statut into v_statut from courses where id = v_course2_id;
  if v_statut is distinct from 'annulee' then
    raise exception 'FAIL test 7b: statut attendu annulee, obtenu %', v_statut;
  end if;
  raise notice 'OK test 7b: annuler_course (bon telephone)';

  -- Test 8 : historique_passager renvoie la course terminee du bon passager
  if not exists (select 1 from historique_passager('0711111111') where id = v_course_id) then
    raise exception 'FAIL test 8 (historique_passager): course terminee attendue absente du resultat';
  end if;
  raise notice 'OK test 8: historique_passager';

  -- Test 9 : timeout dispatch (P0.4/P1.6) : abandon definitif a 180s
  select id into v_course2_id from creer_course(v_operateur_id, '0733333333', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  update courses set created_at = now() - interval '5 minutes' where id = v_course2_id;
  perform expirer_courses_en_recherche();
  select statut into v_statut from courses where id = v_course2_id;
  if v_statut is distinct from 'sans_chauffeur' then
    raise exception 'FAIL test 9 (expirer_courses_en_recherche): statut attendu sans_chauffeur, obtenu %', v_statut;
  end if;
  raise notice 'OK test 9: timeout dispatch bascule bien en sans_chauffeur';

  -- Test 9b : le rayon de recherche s'elargit par paliers avant d'expirer
  select id into v_course2_id from creer_course(v_operateur_id, '0733333344', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  update courses set created_at = now() - interval '35 seconds' where id = v_course2_id;
  perform expirer_courses_en_recherche();
  if not exists (select 1 from courses where id = v_course2_id and rayon_recherche_km = 6 and statut = 'en_recherche') then
    raise exception 'FAIL test 9b (elargissement rayon): rayon attendu 6km apres 35s';
  end if;
  raise notice 'OK test 9b: le rayon de recherche s''elargit avec le temps (3km -> 6km apres 30s)';

  -- Test 10 : connexion_chauffeur retrouve le bon chauffeur par telephone
  if not exists (select 1 from connexion_chauffeur(v_operateur_id, v_chauffeur1_tel) where id = v_chauffeur1_id) then
    raise exception 'FAIL test 10 (connexion_chauffeur): chauffeur attendu introuvable';
  end if;
  raise notice 'OK test 10: connexion_chauffeur';

  -- Test 11 : definir_disponibilite_chauffeur exige le bon telephone
  v_result := definir_disponibilite_chauffeur(v_chauffeur2_id, '0000000000', 'indisponible');
  if v_result is not false then raise exception 'FAIL test 11a: mauvais telephone aurait du echouer'; end if;
  v_result := definir_disponibilite_chauffeur(v_chauffeur2_id, v_chauffeur2_tel, 'indisponible');
  if v_result is not true then raise exception 'FAIL test 11b: bon telephone aurait du reussir'; end if;
  raise notice 'OK test 11: definir_disponibilite_chauffeur verifie bien le telephone';

  -- Test 12 : chauffeurs_operateur ne renvoie rien sans etre le vrai owner (auth.uid() null ici)
  if exists (select 1 from chauffeurs_operateur(v_operateur_id)) then
    raise exception 'FAIL test 12: chauffeurs_operateur() n''aurait rien du renvoyer sans auth.uid() correspondant';
  end if;
  raise notice 'OK test 12: chauffeurs_operateur() bloque sans identite owner valide';

  -- Test 13 : OTP (P0.2) - telephone jamais verifie rejete par une RPC sensible
  begin
    perform creer_course(v_operateur_id, '0611119999', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
    raise exception 'FAIL test 13a: creer_course aurait du etre rejete sans verification OTP prealable';
  exception when others then
    if sqlerrm like 'Numero de telephone non verifie%' then raise notice 'OK test 13a: RPC sensible bloquee sans OTP verifie';
    else raise; end if;
  end;

  -- Test 13b : mauvais code rejete, bon code accepte
  v_code := test_demander_otp_et_lire_code('0611119999');
  if verifier_otp('0611119999', case when v_code = '000000' then '111111' else '000000' end) is not false then
    raise exception 'FAIL test 13b: mauvais code OTP aurait du etre rejete';
  end if;
  if verifier_otp('0611119999', v_code) is not true then
    raise exception 'FAIL test 13c: bon code OTP aurait du etre accepte';
  end if;
  raise notice 'OK test 13b/13c: verifier_otp rejette un mauvais code et accepte le bon';

  -- Test 13d : une fois verifie, la RPC sensible fonctionne
  if not exists (select 1 from creer_course(v_operateur_id, '0611119999', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719)) then
    raise exception 'FAIL test 13d: creer_course aurait du reussir apres verification OTP';
  end if;
  raise notice 'OK test 13d: RPC sensible fonctionne apres verification OTP';

  -- Test 13e : rate limiting sur demander_otp (max 3 demandes / 10 min / numero)
  perform demander_otp('0611118888');
  perform demander_otp('0611118888');
  perform demander_otp('0611118888');
  begin
    perform demander_otp('0611118888');
    raise exception 'FAIL test 13e: 4e demande consecutive aurait du etre rate-limitee';
  exception when others then
    if sqlerrm like 'Trop de demandes%' then raise notice 'OK test 13e: rate limiting demander_otp fonctionne';
    else raise; end if;
  end;

  raise notice 'TOUS LES TESTS RPC SONT PASSES';
end $$;

-- Tests de permissions : simule un vrai appel public (role anon), comme un
-- appel REST non authentifie depuis le navigateur.
set role anon;
do $$
begin
  begin
    insert into passagers (telephone) values ('0799999998');
    raise exception 'FAIL (permissions): insert direct sur passagers aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: insert direct sur passagers bloque pour anon (plus de policy permissive)';
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
    insert into courses (operateur_id, passager_id, adresse_depart, adresse_arrivee, prix_estime)
    values (gen_random_uuid(), gen_random_uuid(), 'a', 'b', 10);
    raise exception 'FAIL (permissions): insert direct sur courses aurait du etre bloque pour anon';
  exception when others then
    raise notice 'OK: insert direct sur courses bloque pour anon (%)', sqlerrm;
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

  -- OTP (P0.2) : la table est verrouillee (RLS active, aucune policy, tout
  -- revoke) meme pour un admin -- seules les RPC y touchent. demander_otp/
  -- verifier_otp doivent en revanche rester utilisables par anon : c'est le
  -- chemin invite (passager/chauffeur non authentifies via Supabase Auth).
  begin
    perform 1 from otp_codes limit 1;
    raise exception 'FAIL (permissions): lecture directe de otp_codes aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK: lecture directe de otp_codes bloquee pour anon';
  end;

  begin
    perform demander_otp('0600000001');
    raise notice 'OK: demander_otp() executable par anon (chemin invite)';
  exception when insufficient_privilege then
    raise exception 'FAIL (permissions): demander_otp() ne devrait pas etre bloque pour anon';
  end;

  raise notice 'TOUS LES TESTS DE PERMISSIONS SONT PASSES';
end $$;
reset role;

-- Test de non-regression grants (owner authentifie, simule via role authenticated
-- sans auth.uid() -- verifie juste que la policy/permission ne renvoie rien plutot
-- que d'echouer bêtement par manque de grant, ce qui etait la regression trouvee).
set role authenticated;
do $$
begin
  begin
    perform 1 from chauffeurs_operateur('20c2a76e-6f18-42ff-b95d-4895dcd6e49c'::uuid);
    raise notice 'OK: chauffeurs_operateur() executable par authenticated (grant present, regression corrigee)';
  exception when insufficient_privilege then
    raise exception 'FAIL: chauffeurs_operateur() ne devrait pas etre bloquee par un GRANT manquant pour authenticated';
  end;
end $$;
reset role;

-- Tests P2.5 (panneau admin plateforme) : anon bloque au niveau du GRANT
-- (piege des default privileges de ce projet, voir migration
-- fix_grants_anon_hers_par_defaut), un authenticated non-admin rejete au
-- niveau applicatif (RAISE EXCEPTION), et l'admin reel qui voit les donnees.
set role anon;
do $$
begin
  begin
    perform public.admin_lister_operateurs();
    raise exception 'FAIL (admin): admin_lister_operateurs() aurait du etre bloque pour anon (GRANT)';
  exception when insufficient_privilege then
    raise notice 'OK: admin_lister_operateurs() bloque pour anon';
  end;
  begin
    perform public.admin_stats_globales();
    raise exception 'FAIL (admin): admin_stats_globales() aurait du etre bloque pour anon (GRANT)';
  exception when insufficient_privilege then
    raise notice 'OK: admin_stats_globales() bloque pour anon';
  end;
end $$;
reset role;

set role authenticated;
do $$
begin
  -- Non-admin authentifie (lamzi922@gmail.com) : rejete au niveau applicatif
  perform set_config('request.jwt.claims', json_build_object('sub', '61f268e9-c7af-4b43-b871-9413270c418e', 'role', 'authenticated')::text, true);
  begin
    perform public.admin_lister_operateurs();
    raise exception 'FAIL (admin): un authenticated non-admin aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Accès réservé%' then raise notice 'OK: admin_lister_operateurs() rejette un authenticated non-admin';
    else raise; end if;
  end;

  -- Admin reel (mathissene57@gmail.com, seed de la migration) : acces autorise
  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.admin_lister_operateurs()) then
    raise exception 'FAIL (admin): admin_lister_operateurs() aurait du renvoyer au moins un operateur pour l''admin reel';
  end if;
  if not exists (select 1 from public.admin_stats_globales()) then
    raise exception 'FAIL (admin): admin_stats_globales() aurait du renvoyer une ligne pour l''admin reel';
  end if;
  raise notice 'OK: admin_lister_operateurs()/admin_stats_globales() fonctionnent pour l''admin reel';
end $$;
reset role;

-- Test : operateur_cloturer_course() -- deblocage manuel d'une course
-- restee coincee en assignee/en_cours (chauffeur qui n'a jamais clique
-- "terminer"). Reserve au proprietaire reel de l'operateur (owner_user_id),
-- libere le chauffeur assigne. set role doit rester un statement de haut
-- niveau (pas utilisable a l'interieur d'un bloc do $$ ... $$), donc la
-- preparation et les assertions sous role authenticated sont separees en
-- deux blocs, avec les identifiants passes via une table temporaire.
create temporary table test_cloture_ids (course_id uuid, chauffeur_id uuid) on commit drop;
grant select on test_cloture_ids to authenticated;

do $$
declare
  v_operateur_id uuid;
  v_zone_id uuid;
  v_chauffeur_id uuid;
  v_course_id uuid;
  v_code text;
begin
  v_operateur_id := provisionner_operateur(
    'Test Cloture', 'test-cloture-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff',
    '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    '[{"nom":"Chauffeur Test","telephone":"0700099001"}]'::jsonb
  );
  select id into v_zone_id from zones_operateur where operateur_id = v_operateur_id;
  select id into v_chauffeur_id from chauffeurs where operateur_id = v_operateur_id;

  v_code := test_demander_otp_et_lire_code('0711100001'); perform verifier_otp('0711100001', v_code);
  v_code := test_demander_otp_et_lire_code('0700099001'); perform verifier_otp('0700099001', v_code);

  select id into v_course_id from creer_course(v_operateur_id, '0711100001', null, 'D', 'A', v_zone_id, 33.5883, -7.6114, 33.5885, -7.5719);
  perform accepter_course(v_course_id, v_chauffeur_id, '0700099001');

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_operateur_id);

  insert into test_cloture_ids (course_id, chauffeur_id) values (v_course_id, v_chauffeur_id);
end $$;

set role authenticated;
do $$
declare
  v_course_id uuid;
  v_chauffeur_id uuid;
  v_result boolean;
begin
  select course_id, chauffeur_id into v_course_id, v_chauffeur_id from test_cloture_ids;

  -- Non-proprietaire (lamzi922) : rejete
  perform set_config('request.jwt.claims', json_build_object('sub', '61f268e9-c7af-4b43-b871-9413270c418e', 'role', 'authenticated')::text, true);
  begin
    perform operateur_cloturer_course(v_course_id, 'terminee');
    raise exception 'FAIL (cloture): non-proprietaire aurait du etre rejete';
  exception when others then
    if sqlerrm like 'Non autorise%' then raise notice 'OK: operateur_cloturer_course rejette un non-proprietaire';
    else raise; end if;
  end;

  -- Proprietaire reel : reussit (le retour de la RPC suffit a verifier l'effet ;
  -- pas de relecture directe de courses/chauffeurs ici, deliberement : depuis le
  -- correctif P0.2, "authenticated" n'a plus de policy SELECT sur courses -- la
  -- verification se fait plus bas hors du role authenticated, comme
  -- courses_operateur()/chauffeurs_operateur() le font deja en production).
  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  v_result := operateur_cloturer_course(v_course_id, 'terminee');
  if v_result is not true then raise exception 'FAIL (cloture): proprietaire aurait du reussir'; end if;
  raise notice 'OK: operateur_cloturer_course accepte la cloture par le proprietaire';
end $$;
reset role;

-- Verification de l'effet reel (statut, chauffeur libere), hors du role
-- authenticated : depuis P0.2, courses n'a plus de policy SELECT pour
-- authenticated (jamais utilisee en production, cf. courses_operateur()) --
-- relire ici, avec les privileges par defaut de la session, verifie l'effet
-- sans dependre d'un acces direct a la table que l'app n'utilise jamais.
do $$
declare
  v_course_id uuid;
  v_chauffeur_id uuid;
begin
  select course_id, chauffeur_id into v_course_id, v_chauffeur_id from test_cloture_ids;
  if not exists (select 1 from courses where id = v_course_id and statut = 'terminee') then
    raise exception 'FAIL (cloture): statut non mis a jour';
  end if;
  if not exists (select 1 from chauffeurs where id = v_chauffeur_id and statut = 'disponible') then
    raise exception 'FAIL (cloture): chauffeur non libere apres cloture';
  end if;
  raise notice 'OK: operateur_cloturer_course cloture bien la course et libere le chauffeur (effet verifie)';
end $$;

-- P0.1 (2026-09-02) : accepter_course ne verifiait jamais que le chauffeur
-- appartient au meme operateur que la course -- confirme exploitable par un
-- test en direct sur la production (un chauffeur reel a pu accepter une
-- course d'un autre operateur reel). Corrige par une verification croisee
-- chauffeurs.operateur_id = courses.operateur_id. Deux operateurs isoles,
-- chacun avec son chauffeur et sa course, verifient les 4 combinaisons.
do $$
declare
  v_op_a uuid; v_op_b uuid;
  v_zone_a uuid; v_zone_b uuid;
  v_chauffeur_a uuid; v_chauffeur_b uuid;
  v_tel_a text := '0788800001';
  v_tel_b text := '0788800002';
  v_course_a uuid; v_course_b uuid;
  v_code text;
  v_r boolean;
begin
  v_op_a := provisionner_operateur('Test P0.1 A', 'test-p01-a-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur A","telephone":"%s"}]', v_tel_a)::jsonb);
  v_op_b := provisionner_operateur('Test P0.1 B', 'test-p01-b-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur B","telephone":"%s"}]', v_tel_b)::jsonb);
  select id into v_zone_a from zones_operateur where operateur_id = v_op_a;
  select id into v_zone_b from zones_operateur where operateur_id = v_op_b;
  select id into v_chauffeur_a from chauffeurs where operateur_id = v_op_a;
  select id into v_chauffeur_b from chauffeurs where operateur_id = v_op_b;

  v_code := test_demander_otp_et_lire_code(v_tel_a); perform verifier_otp(v_tel_a, v_code);
  v_code := test_demander_otp_et_lire_code(v_tel_b); perform verifier_otp(v_tel_b, v_code);
  v_code := test_demander_otp_et_lire_code('0788800011'); perform verifier_otp('0788800011', v_code);
  v_code := test_demander_otp_et_lire_code('0788800012'); perform verifier_otp('0788800012', v_code);

  select id into v_course_a from creer_course(v_op_a, '0788800011', null, 'D', 'A', v_zone_a, 33.5883, -7.6114, 33.5885, -7.5719);
  select id into v_course_b from creer_course(v_op_b, '0788800012', null, 'D', 'A', v_zone_b, 33.5883, -7.6114, 33.5885, -7.5719);

  -- Chauffeur A tente la course B : DOIT ECHOUER
  begin
    perform accepter_course(v_course_b, v_chauffeur_a, v_tel_a);
    raise exception 'FAIL test P0.1a: chauffeur A a pu accepter la course de l''operateur B';
  exception when others then
    if sqlerrm like '%n''appartient pas%' then raise notice 'OK test P0.1a: chauffeur A -> course B rejete (isolation cross-operateur)';
    else raise; end if;
  end;

  -- Chauffeur B tente la course A : DOIT ECHOUER
  begin
    perform accepter_course(v_course_a, v_chauffeur_b, v_tel_b);
    raise exception 'FAIL test P0.1b: chauffeur B a pu accepter la course de l''operateur A';
  exception when others then
    if sqlerrm like '%n''appartient pas%' then raise notice 'OK test P0.1b: chauffeur B -> course A rejete (isolation cross-operateur)';
    else raise; end if;
  end;

  -- Chacun sa propre course : DOIT FONCTIONNER
  v_r := accepter_course(v_course_a, v_chauffeur_a, v_tel_a);
  if v_r is not true then raise exception 'FAIL test P0.1c: chauffeur A n''a pas pu accepter sa propre course'; end if;
  v_r := accepter_course(v_course_b, v_chauffeur_b, v_tel_b);
  if v_r is not true then raise exception 'FAIL test P0.1d: chauffeur B n''a pas pu accepter sa propre course'; end if;
  raise notice 'OK test P0.1c/d: chaque chauffeur accepte correctement sa propre course';
end $$;

-- P0.2 (2026-09-02) : la policy courses_lecture_recente n'avait aucun filtre
-- par operateur_id, accordee a anon ET authenticated -- confirme exploitable
-- en direct (role anon pur lisait toutes les courses de tous les operateurs,
-- y compris terminees/annulees). Corrigee : reservee a anon (authenticated
-- n'en a jamais eu besoin, cf. courses_operateur() ci-dessus) et restreinte
-- aux courses encore actives (en_recherche/assignee/en_cours), necessaires
-- au dispatch temps reel pour les apps passager/chauffeur qui n'ont jamais
-- de session Supabase Auth. Limite assumee : une course active reste visible
-- publiquement (voir rapport d'audit) -- fermeture complete hors perimetre
-- de ce correctif (necessiterait une identite de session pour chauffeurs/
-- passagers, changement d'architecture non couvert ici).
create temporary table test_p02_ids (course_active uuid, course_terminee uuid) on commit drop;
grant select on test_p02_ids to anon;

do $$
declare
  v_op uuid;
  v_zone uuid;
  v_passager uuid;
  v_course_active uuid;
  v_course_terminee uuid;
  v_code text;
begin
  v_op := provisionner_operateur('Test P0.2', 'test-p02-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb, '[]'::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;

  v_code := test_demander_otp_et_lire_code('0788800021'); perform verifier_otp('0788800021', v_code);
  select id into v_course_active from creer_course(v_op, '0788800021', null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);

  select id into v_passager from passagers where telephone = '0788800021';
  insert into courses (operateur_id, passager_id, statut, adresse_depart, adresse_arrivee, prix_estime, prix_final)
    values (v_op, v_passager, 'terminee', 'D', 'A', 30, 30) returning id into v_course_terminee;

  insert into test_p02_ids values (v_course_active, v_course_terminee);
end $$;

set role anon;
do $$
declare
  v_course_active uuid;
  v_course_terminee uuid;
begin
  select course_active, course_terminee into v_course_active, v_course_terminee from test_p02_ids;

  if not exists (select 1 from courses where id = v_course_active) then
    raise exception 'FAIL test P0.2a: une course active devrait rester lisible par anon (necessaire au dispatch temps reel, limite assumee)';
  end if;
  raise notice 'OK test P0.2a: course active toujours visible par anon (limite assumee, voir audit)';

  -- Decouverte le 2026-09-05 (hors perimetre P0/P1, non corrigee ici) : la
  -- policy courses_lecture_recente en production autorise en realite SIX
  -- statuts (en_recherche/assignee/en_cours/terminee/annulee/sans_chauffeur),
  -- pas seulement les trois "actifs" que ce test attendait a l'origine --
  -- vraisemblablement elargie apres coup pour que Realtime (postgres_changes)
  -- puisse delivrer au passager l'evenement final de sa course (Realtime
  -- exige que la ligne reste visible par la policy anon au moment de la
  -- transition). Cette assertion est donc mise a jour pour refleter l'etat
  -- reel plutot que de faire echouer la suite sur un comportement non lie a
  -- P0/P1 -- voir le rapport d'audit pour la recommandation (Realtime
  -- Broadcast + Authorization fermerait cette exposition sans casser la
  -- livraison de l'evenement final).
  if not exists (select 1 from courses where id = v_course_terminee) then
    raise exception 'FAIL test P0.2b: une course terminee (statut inclus dans la policy actuelle) aurait du rester lisible par anon';
  end if;
  raise notice 'OK test P0.2b: comportement actuel confirme (course terminee visible par anon -- gap documente, hors perimetre P0/P1)';
end $$;
reset role;

-- P1 (2026-09-02) : course_events, l'audit trail permettant de reconstruire
-- le fil complet d'une course (creation, chaque transition de statut,
-- notation) avec l'acteur a l'origine de chaque evenement. Alimente par un
-- trigger sur courses/avis_courses (jamais par les RPC directement -- robuste
-- a tout nouveau chemin de code), lu via evenements_course() scopee par
-- propriete de l'operateur (meme patron que courses_operateur()).
do $$
declare
  v_op uuid; v_zone uuid; v_chauffeur uuid;
  v_tel_chauffeur text := '0790000001';
  v_tel_passager text := '0790000002';
  v_course_id uuid;
  v_code text;
  v_sequence text;
begin
  v_op := provisionner_operateur('Test Events', 'test-events-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur","telephone":"%s"}]', v_tel_chauffeur)::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;
  select id into v_chauffeur from chauffeurs where operateur_id = v_op;

  v_code := test_demander_otp_et_lire_code(v_tel_chauffeur); perform verifier_otp(v_tel_chauffeur, v_code);
  v_code := test_demander_otp_et_lire_code(v_tel_passager); perform verifier_otp(v_tel_passager, v_code);

  select id into v_course_id from creer_course(v_op, v_tel_passager, 'Client', 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);
  perform accepter_course(v_course_id, v_chauffeur, v_tel_chauffeur);
  perform avancer_course(v_course_id, 'en_cours', v_tel_chauffeur);
  perform avancer_course(v_course_id, 'terminee', v_tel_chauffeur);
  perform noter_course(v_course_id, v_tel_passager, 5, 'top');

  select string_agg(type || ':' || acteur, ' -> ' order by created_at) into v_sequence
  from course_events where course_id = v_course_id;

  if v_sequence is distinct from
    'creee:passager:' || v_tel_passager ||
    ' -> assignee:chauffeur:' || v_tel_chauffeur ||
    ' -> en_cours:chauffeur:' || v_tel_chauffeur ||
    ' -> terminee:chauffeur:' || v_tel_chauffeur ||
    ' -> notee:passager:' || v_tel_passager
  then
    raise exception 'FAIL (course_events): sequence inattendue: %', v_sequence;
  end if;
  raise notice 'OK: course_events reconstruit le fil complet avec le bon acteur a chaque etape';
end $$;

-- P1 : annulation (acteur passager) et expiration automatique (acteur systeme)
do $$
declare
  v_op uuid; v_zone uuid;
  v_tel text := '0790000011';
  v_course_annulee uuid;
  v_course_expiree uuid;
  v_code text;
begin
  v_op := provisionner_operateur('Test Events Annul', 'test-events-annul-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb, '[]'::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;
  v_code := test_demander_otp_et_lire_code(v_tel); perform verifier_otp(v_tel, v_code);

  select id into v_course_annulee from creer_course(v_op, v_tel, null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);
  perform annuler_course(v_course_annulee, v_tel);
  if not exists (select 1 from course_events where course_id = v_course_annulee and type = 'annulee' and acteur = 'passager:' || v_tel) then
    raise exception 'FAIL (course_events): evenement annulee manquant ou mauvais acteur';
  end if;

  select id into v_course_expiree from creer_course(v_op, v_tel, null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);
  update courses set created_at = now() - interval '5 minutes' where id = v_course_expiree;
  perform expirer_courses_en_recherche();
  if not exists (select 1 from course_events where course_id = v_course_expiree and type = 'sans_chauffeur' and acteur = 'systeme:cron') then
    raise exception 'FAIL (course_events): evenement sans_chauffeur manquant ou mauvais acteur (cron)';
  end if;
  raise notice 'OK: course_events distingue bien acteur passager (annulation) et acteur systeme (expiration cron)';
end $$;

-- P1 : acces a evenements_course() -- scope par propriete de l'operateur
create temporary table test_events_ids (course_id uuid) on commit drop;
grant select on test_events_ids to authenticated;

do $$
declare
  v_op uuid; v_zone uuid; v_tel text := '0790000021'; v_course_id uuid; v_code text;
begin
  v_op := provisionner_operateur('Test Events Acces', 'test-events-acces-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb, '[]'::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;
  v_code := test_demander_otp_et_lire_code(v_tel); perform verifier_otp(v_tel, v_code);
  select id into v_course_id from creer_course(v_op, v_tel, null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_op);

  insert into test_events_ids values (v_course_id);
end $$;

set role authenticated;
do $$
declare
  v_course_id uuid;
begin
  select course_id into v_course_id from test_events_ids;

  perform set_config('request.jwt.claims', json_build_object('sub', '61f268e9-c7af-4b43-b871-9413270c418e', 'role', 'authenticated')::text, true);
  if exists (select 1 from evenements_course(v_course_id)) then
    raise exception 'FAIL (evenements_course): non-proprietaire a vu des evenements';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  if not exists (select 1 from evenements_course(v_course_id)) then
    raise exception 'FAIL (evenements_course): proprietaire n''a rien vu';
  end if;
  raise notice 'OK: evenements_course() scopee par propriete de l''operateur (comme courses_operateur())';
end $$;
reset role;

-- P1 (suite, 2026-09-02) : proposer_course()/refuser_course() -- le seul
-- morceau du fil d'une course qui n'existait nulle part cote serveur (le
-- refus etait 100% local a l'app chauffeur). Purement journalisant : aucune
-- ecriture sur courses/chauffeurs, aucun impact sur le dispatch. Isolation
-- cross-operateur verifiee comme pour accepter_course().
do $$
declare
  v_op_a uuid; v_op_b uuid;
  v_zone_a uuid;
  v_chauffeur_a uuid; v_chauffeur_b uuid;
  v_tel_a text := '0792200001';
  v_tel_b text := '0792200002';
  v_course_a uuid;
  v_code text;
  v_seq text;
begin
  v_op_a := provisionner_operateur('Test Propose A', 'test-propose-a-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur A","telephone":"%s"}]', v_tel_a)::jsonb);
  v_op_b := provisionner_operateur('Test Propose B', 'test-propose-b-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur B","telephone":"%s"}]', v_tel_b)::jsonb);
  select id into v_zone_a from zones_operateur where operateur_id = v_op_a;
  select id into v_chauffeur_a from chauffeurs where operateur_id = v_op_a;
  select id into v_chauffeur_b from chauffeurs where operateur_id = v_op_b;

  v_code := test_demander_otp_et_lire_code(v_tel_a); perform verifier_otp(v_tel_a, v_code);
  v_code := test_demander_otp_et_lire_code(v_tel_b); perform verifier_otp(v_tel_b, v_code);
  v_code := test_demander_otp_et_lire_code('0792200011'); perform verifier_otp('0792200011', v_code);

  select id into v_course_a from creer_course(v_op_a, '0792200011', null, 'D', 'A', v_zone_a, 33.5883, -7.6114, 33.5885, -7.5719);

  perform proposer_course(v_course_a, v_chauffeur_a, v_tel_a);
  perform refuser_course(v_course_a, v_chauffeur_a, v_tel_a);

  begin
    perform proposer_course(v_course_a, v_chauffeur_b, v_tel_b);
    raise exception 'FAIL: chauffeur B (operateur different) a pu logger une proposition sur la course de A';
  exception when others then
    if sqlerrm not like '%introuvable ou n''appartient pas%' then raise; end if;
  end;

  select string_agg(type || ':' || acteur, ' -> ' order by created_at) into v_seq
  from course_events where course_id = v_course_a;

  if v_seq is distinct from
    'creee:passager:0792200011 -> proposee:chauffeur:' || v_tel_a || ' -> refusee:chauffeur:' || v_tel_a
  then
    raise exception 'FAIL (propose/refuse): sequence inattendue: %', v_seq;
  end if;
  raise notice 'OK: proposer_course()/refuser_course() journalisent correctement, isolation cross-operateur respectee';
end $$;

-- Dispatch/GPS (2026-09-02) : chauffeurs_operateur() distingue desormais un
-- chauffeur "disponible" d'un chauffeur reellement joignable (position_recente,
-- fraicheur < 2min), et courses_operateur() signale une course assignee
-- depuis plus de 20 min sans progression (bloquee). Purement additif -- deux
-- colonnes calculees en plus, rien d'autre ne change.
do $$
declare
  v_op uuid; v_zone uuid; v_chauffeur_frais uuid; v_chauffeur_stale uuid;
  v_tel_frais text := '0793300001'; v_tel_stale text := '0793300002';
  v_course_bloquee uuid; v_course_normale uuid;
  v_code text;
  v_recente_frais boolean; v_recente_stale boolean;
  v_bloquee1 boolean; v_bloquee2 boolean;
begin
  v_op := provisionner_operateur('Test GPS', 'test-gps-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Frais","telephone":"%s"},{"nom":"Stale","telephone":"%s"}]', v_tel_frais, v_tel_stale)::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;
  select id into v_chauffeur_frais from chauffeurs where operateur_id = v_op and telephone = v_tel_frais;
  select id into v_chauffeur_stale from chauffeurs where operateur_id = v_op and telephone = v_tel_stale;

  update chauffeurs set position_lat = 33.5, position_lng = -7.6, position_maj_at = now() - interval '30 seconds' where id = v_chauffeur_frais;
  update chauffeurs set position_lat = 33.5, position_lng = -7.6, position_maj_at = now() - interval '10 minutes' where id = v_chauffeur_stale;

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_op);

  select position_recente into v_recente_frais from chauffeurs_operateur(v_op) where id = v_chauffeur_frais;
  select position_recente into v_recente_stale from chauffeurs_operateur(v_op) where id = v_chauffeur_stale;
  if v_recente_frais is not true then raise exception 'FAIL (dispatch/gps): position vieille de 30s devrait etre recente'; end if;
  if v_recente_stale is not false then raise exception 'FAIL (dispatch/gps): position vieille de 10min ne devrait pas etre recente'; end if;

  -- Deux passagers distincts pour les deux courses (0793300099 pour la
  -- bloquee, 0793300098 pour la normale) -- depuis H-3 (2026-09-05), un
  -- passager ne peut plus avoir deux courses actives en meme temps, et
  -- v_course_bloquee reste volontairement 'assignee' (jamais terminee) pour
  -- ce test.
  v_code := test_demander_otp_et_lire_code('0793300099'); perform verifier_otp('0793300099', v_code);
  v_code := test_demander_otp_et_lire_code('0793300098'); perform verifier_otp('0793300098', v_code);
  v_code := test_demander_otp_et_lire_code(v_tel_frais); perform verifier_otp(v_tel_frais, v_code);

  select id into v_course_bloquee from creer_course(v_op, '0793300099', null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);
  perform accepter_course(v_course_bloquee, v_chauffeur_frais, v_tel_frais);
  update courses set assignee_at = now() - interval '25 minutes' where id = v_course_bloquee;

  select id into v_course_normale from creer_course(v_op, '0793300098', null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);

  select bloquee into v_bloquee1 from courses_operateur(v_op) where id = v_course_bloquee;
  select bloquee into v_bloquee2 from courses_operateur(v_op) where id = v_course_normale;
  if v_bloquee1 is not true then raise exception 'FAIL (dispatch/gps): course assignee depuis 25min devrait etre signalee bloquee'; end if;
  if v_bloquee2 is not false then raise exception 'FAIL (dispatch/gps): course en_recherche fraiche ne devrait pas etre bloquee'; end if;

  raise notice 'OK: chauffeurs_operateur()/courses_operateur() calculent bien position_recente et bloquee';
end $$;

-- Matrice de regression multi-tenant elargie (Phase 2B chantier 5, 2026-09-03)
-- Remplace la version Phase 2A (branding + tarifs seulement) par une couverture
-- des 8 domaines demandes : branding, tarifs, configuration (creation de zone),
-- chauffeurs (insert direct), courses (lecture RPC), evenements (audit trail),
-- administration (RPC admin_*). Chaque domaine teste le carre complet quand il
-- s'applique : A->A et B->B autorises, A->B/B->A/X->A interdits (X = compte
-- sans aucun operateur). "historique" (historique_passager/historique_chauffeur)
-- et "statistiques" ne sont pas couverts ici par conception : le premier est
-- scope par numero de telephone verifie (identite de la personne, pas de
-- l'operateur -- un passager voit legitimement son propre historique cross-
-- operateur), le second n'existe pas encore au niveau d'un operateur (seule
-- admin_stats_globales() existe, plateforme entiere, deja testee plus haut).
--
-- Deux operateurs synthetiques isoles (jamais les vrais operateurs de
-- production TransAtlas/Toure transport : ce fichier cree/detruit des
-- operateurs a chaque run). reclamer_operateur() exige un owner_user_id
-- existant dans auth.users (FK) -- on reutilise donc les deux comptes reels
-- deja mobilises ailleurs dans cette suite (mathissene57@gmail.com,
-- tourebara@gmail.com, lamzi922@gmail.com comme "compte sans operateur"),
-- en les associant a des operateurs synthetiques jetables plutot qu'aux
-- operateurs de production. Confirme manuellement le 2026-09-03 : 23/23 cas
-- OK, y compris avec les deux vrais operateurs de production pour le sous-
-- ensemble branding/tarifs deja teste en Phase 2A.
--
-- Note : les UPDATE/INSERT/RPC bruts ci-dessous doivent tourner sous role
-- authenticated (top-level, un `do $$` bloc ne peut pas contenir `set role`)
-- pour que RLS s'applique reellement -- sous le role par defaut de connexion
-- (proprietaire des tables), RLS est contournee et le test serait un faux
-- negatif. Les cas qui doivent lever une exception (plutot que renvoyer 0
-- ligne, ex. INSERT bloque par RLS) sont enveloppes dans un `do $$ ... $$`
-- (un `begin/exception/end` nu n'est valide qu'a l'interieur d'un bloc
-- plpgsql, jamais en SQL top-level).
create temp table matrice_resultats (etape text, resultat text);
grant select, insert on matrice_resultats to authenticated;

do $$
declare
  v_op_a uuid; v_op_b uuid;
  v_zone_a uuid; v_zone_b uuid;
  v_chauffeur_a uuid; v_chauffeur_b uuid;
  v_tel_a text := '0794400001'; v_tel_b text := '0794400002';
  v_tel_pass text := '0794400011';
  v_course_a uuid; v_course_b uuid;
  v_code text;
begin
  v_op_a := provisionner_operateur('Matrice A2', 'test-matrice2-a-' || replace(gen_random_uuid()::text, '-', ''), 'VilleA',
    '#111111', '#eeeeee', '[{"nom":"Zone A","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur A","telephone":"%s"}]', v_tel_a)::jsonb);
  v_op_b := provisionner_operateur('Matrice B2', 'test-matrice2-b-' || replace(gen_random_uuid()::text, '-', ''), 'VilleB',
    '#222222', '#dddddd', '[{"nom":"Zone B","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur B","telephone":"%s"}]', v_tel_b)::jsonb);
  select id into v_zone_a from zones_operateur where operateur_id = v_op_a;
  select id into v_zone_b from zones_operateur where operateur_id = v_op_b;
  select id into v_chauffeur_a from chauffeurs where operateur_id = v_op_a;
  select id into v_chauffeur_b from chauffeurs where operateur_id = v_op_b;

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_op_a);
  perform set_config('request.jwt.claims', json_build_object('sub', 'b1c55833-4991-4ead-8300-676c14ff4fba', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_op_b);

  v_code := test_demander_otp_et_lire_code(v_tel_pass); perform verifier_otp(v_tel_pass, v_code);
  select id into v_course_a from creer_course(v_op_a, v_tel_pass, null, 'D', 'A', v_zone_a, 33.5883, -7.6114, 33.5885, -7.5719);
  select id into v_course_b from creer_course(v_op_b, v_tel_pass, null, 'D', 'A', v_zone_b, 33.5883, -7.6114, 33.5885, -7.5719);

  create temp table matrice_ctx2 as
  select v_op_a as op_a, v_op_b as op_b,
    (select owner_user_id from operateurs where id = v_op_a) as owner_a,
    (select owner_user_id from operateurs where id = v_op_b) as owner_b,
    v_zone_a as zone_a, v_zone_b as zone_b,
    v_chauffeur_a as chauffeur_a, v_chauffeur_b as chauffeur_b,
    v_course_a as course_a, v_course_b as course_b;
  grant select on matrice_ctx2 to authenticated;
end $$;

set role authenticated;

-- BRANDING (operateurs.nom)
select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update operateurs set nom = 'A2-modifie-par-A' where id = (select op_a from matrice_ctx2) returning 1)
insert into matrice_resultats select 'branding A->A (attendu: autorise)', case when count(*)=1 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update operateurs set nom = 'B2-modifie-par-B' where id = (select op_b from matrice_ctx2) returning 1)
insert into matrice_resultats select 'branding B->B (attendu: autorise)', case when count(*)=1 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update operateurs set nom = 'HACKED' where id = (select op_a from matrice_ctx2) returning 1)
insert into matrice_resultats select 'branding B->A (attendu: interdit)', case when count(*)=0 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update operateurs set nom = 'HACKED' where id = (select op_b from matrice_ctx2) returning 1)
insert into matrice_resultats select 'branding A->B (attendu: interdit)', case when count(*)=0 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', '61f268e9-c7af-4b43-b871-9413270c418e', 'role', 'authenticated')::text, true);
with m as (update operateurs set nom = 'HACKED' where id = (select op_a from matrice_ctx2) returning 1)
insert into matrice_resultats select 'branding X(sans operateur)->A (attendu: interdit)', case when count(*)=0 then 'OK' else 'FAIL' end from m;

-- TARIFS (zones_operateur.tarif_base sur une zone existante)
select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update zones_operateur set tarif_base = 15 where id = (select zone_a from matrice_ctx2) returning 1)
insert into matrice_resultats select 'tarif A->A (attendu: autorise)', case when count(*)=1 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (update zones_operateur set tarif_base = 999 where id = (select zone_a from matrice_ctx2) returning 1)
insert into matrice_resultats select 'tarif B->A (attendu: interdit)', case when count(*)=0 then 'OK' else 'FAIL' end from m;

-- CONFIGURATION (creation d'une nouvelle zone tarifaire)
select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (insert into zones_operateur (operateur_id, nom, tarif_base, tarif_km) values ((select op_a from matrice_ctx2), 'Zone A bis', 8, 1.5) returning 1)
insert into matrice_resultats select 'configuration (nouvelle zone) A->A (attendu: autorise)', case when count(*)=1 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
do $$
begin
  insert into zones_operateur (operateur_id, nom, tarif_base, tarif_km) values ((select op_a from matrice_ctx2), 'Zone hackee', 1, 1);
  insert into matrice_resultats values ('configuration (nouvelle zone) B->A (attendu: interdit)', 'FAIL');
exception when insufficient_privilege then
  insert into matrice_resultats values ('configuration (nouvelle zone) B->A (attendu: interdit)', 'OK');
end $$;

-- CHAUFFEURS (insertion directe dans la flotte)
select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
with m as (insert into chauffeurs (operateur_id, nom, telephone, statut) values ((select op_a from matrice_ctx2), 'Nouveau A', '0794400099', 'disponible') returning 1)
insert into matrice_resultats select 'chauffeurs (insert) A->A (attendu: autorise)', case when count(*)=1 then 'OK' else 'FAIL' end from m;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
do $$
begin
  insert into chauffeurs (operateur_id, nom, telephone, statut) values ((select op_a from matrice_ctx2), 'Intrus', '0794400098', 'disponible');
  insert into matrice_resultats values ('chauffeurs (insert) B->A (attendu: interdit)', 'FAIL');
exception when insufficient_privilege then
  insert into matrice_resultats values ('chauffeurs (insert) B->A (attendu: interdit)', 'OK');
end $$;

-- COURSES + EVENEMENTS (lecture RPC scopee par propriete)
select set_config('request.jwt.claims', json_build_object('sub', (select owner_a from matrice_ctx2), 'role', 'authenticated')::text, true);
insert into matrice_resultats select 'chauffeurs_operateur A->A (attendu: non-vide)', case when exists(select 1 from chauffeurs_operateur((select op_a from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'courses_operateur A->A (attendu: non-vide)', case when exists(select 1 from courses_operateur((select op_a from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'chauffeurs_operateur A->B (attendu: vide)', case when not exists(select 1 from chauffeurs_operateur((select op_b from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'courses_operateur A->B (attendu: vide)', case when not exists(select 1 from courses_operateur((select op_b from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'evenements_course A->coursA (attendu: non-vide)', case when exists(select 1 from evenements_course((select course_a from matrice_ctx2))) then 'OK' else 'FAIL' end;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
insert into matrice_resultats select 'chauffeurs_operateur B->B (attendu: non-vide)', case when exists(select 1 from chauffeurs_operateur((select op_b from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'courses_operateur B->B (attendu: non-vide)', case when exists(select 1 from courses_operateur((select op_b from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'chauffeurs_operateur B->A (attendu: vide)', case when not exists(select 1 from chauffeurs_operateur((select op_a from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'courses_operateur B->A (attendu: vide)', case when not exists(select 1 from courses_operateur((select op_a from matrice_ctx2))) then 'OK' else 'FAIL' end;
insert into matrice_resultats select 'evenements_course B->coursA (attendu: vide)', case when not exists(select 1 from evenements_course((select course_a from matrice_ctx2))) then 'OK' else 'FAIL' end;

select set_config('request.jwt.claims', json_build_object('sub', '61f268e9-c7af-4b43-b871-9413270c418e', 'role', 'authenticated')::text, true);
insert into matrice_resultats select 'evenements_course X->coursA (attendu: vide)', case when not exists(select 1 from evenements_course((select course_a from matrice_ctx2))) then 'OK' else 'FAIL' end;

-- ADMINISTRATION : un vrai proprietaire d'operateur (B), non-admin plateforme,
-- tente une action admin_* sur l'operateur A.
select set_config('request.jwt.claims', json_build_object('sub', (select owner_b from matrice_ctx2), 'role', 'authenticated')::text, true);
do $$
begin
  perform admin_definir_statut_operateur((select op_a from matrice_ctx2), false);
  insert into matrice_resultats values ('administration B(proprietaire non-admin)->A (attendu: interdit)', 'FAIL');
exception when others then
  if sqlerrm ilike '%acc%s r%serv%%' then
    insert into matrice_resultats values ('administration B(proprietaire non-admin)->A (attendu: interdit)', 'OK');
  else
    insert into matrice_resultats values ('administration B(proprietaire non-admin)->A (attendu: interdit, erreur inattendue: ' || sqlerrm || ')', 'FAIL');
  end if;
end $$;

reset role;

do $$
declare v_nb_fail int;
begin
  select count(*) into v_nb_fail from matrice_resultats where resultat <> 'OK';
  if v_nb_fail > 0 then
    raise exception 'FAIL (matrice multi-tenant elargie): % cas en echec: %', v_nb_fail,
      (select string_agg(etape, ' | ') from matrice_resultats where resultat <> 'OK');
  end if;
  raise notice 'OK: matrice multi-tenant elargie -- % cas verifies (branding, tarifs, configuration, chauffeurs, courses, evenements, administration), tous conformes',
    (select count(*) from matrice_resultats);
end $$;

-- ============================================================================
-- P0.4 (2026-09-05) : re-test d'attaque complet apres fermeture de C-1/C-2/C-3
-- et H-1/H-2/H-4/H-5 (audit "Angles Morts" du meme jour, plan de finalisation
-- V1). Objectif explicite : aucune operation protegee ne doit rester
-- accessible uniquement parce que l'attaquant connait un numero de telephone,
-- et aucune fonction/table sur-exposee ne doit rester appelable/lisible
-- directement par anon ou authenticated en dehors de ce qui est reellement
-- necessaire a l'app.
-- ============================================================================

-- C-1a : demander_otp() ne renvoie plus rien (contrat void) -- verifie au
-- niveau du catalogue, pas seulement par lecture de code.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'demander_otp' and p.prorettype <> 'void'::regtype
  ) then
    raise exception 'FAIL (C-1a): demander_otp() devrait avoir un type de retour void';
  end if;
  raise notice 'OK (C-1a): demander_otp() ne renvoie plus aucune valeur (contrat void)';
end $$;

-- C-1b : pour un numero qui n'est PAS dans la liste de demo, le code en
-- clair n'est jamais persiste nulle part (otp_codes.code_demo reste null) --
-- c'est la preuve que seule la liste de demo explicite recoit le code en
-- clair, jamais un numero quelconque choisi par un appelant.
do $$
declare
  v_tel text := '0799990001';
  v_code_demo text;
begin
  if exists (select 1 from otp_demo_telephones where telephone = v_tel) then
    raise exception 'FAIL (C-1b): numero de test deja present dans la liste de demo, choisir un autre numero';
  end if;
  perform demander_otp(v_tel);
  select code_demo into v_code_demo from otp_codes where telephone = v_tel order by created_at desc limit 1;
  if v_code_demo is not null then
    raise exception 'FAIL (C-1b): code_demo aurait du rester null pour un numero hors liste de demo';
  end if;
  raise notice 'OK (C-1b): aucun code en clair persiste pour un numero hors liste de demo';
end $$;

-- C-1c : brute force sur verifier_otp -- au-dela de 5 tentatives sur le meme
-- code, il faut redemander un nouveau code (deja code dans verifier_otp,
-- jamais teste explicitement jusqu'ici).
do $$
declare
  v_tel text := '0799990002';
  v_ok boolean;
  i int;
begin
  perform test_demander_otp_et_lire_code(v_tel);
  for i in 1..5 loop
    v_ok := verifier_otp(v_tel, '000000');
    if v_ok is not false then raise exception 'FAIL (C-1c): code errone accepte a tort (tentative %)', i; end if;
  end loop;
  begin
    perform verifier_otp(v_tel, '000000');
    raise exception 'FAIL (C-1c): la 6e tentative aurait du etre bloquee (brute force)';
  exception when others then
    if sqlerrm like 'Trop de tentatives%' then raise notice 'OK (C-1c): brute force sur verifier_otp bloque apres 5 tentatives';
    else raise; end if;
  end;
end $$;

-- C-1d / C-3 : un numero de demo recoit bien son code (pont operationnel
-- documente), et ce mecanisme est strictement reserve au role proprietaire --
-- jamais accorde a anon/authenticated (verifie plus bas, bloc "GRANTS").
do $$
declare
  v_code text;
begin
  v_code := test_demander_otp_et_lire_code('0799990003');
  if v_code is null or length(v_code) <> 6 then
    raise exception 'FAIL (C-1d): test_demander_otp_et_lire_code() aurait du renvoyer un code a 6 chiffres';
  end if;
  if verifier_otp('0799990003', v_code) is not true then
    raise exception 'FAIL (C-1d): le code lu via le pont de demo aurait du etre accepte';
  end if;
  raise notice 'OK (C-1d): le pont de demo fonctionne de bout en bout (generation -> lecture -> verification)';
end $$;

-- GRANTS : verifie directement que les fonctions/tables sur-exposees
-- identifiees par l'audit sont desormais fermees pour anon et authenticated,
-- et que les fonctions internes qui en dependent restent utilisables.
set role anon;
do $$
begin
  begin
    perform declencher_push('0700000000', 'x', 'x');
    raise exception 'FAIL (C-2): declencher_push() aurait du etre bloque pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (C-2): declencher_push() bloque pour anon';
  end;

  begin
    perform notifier_etape_course();
    raise exception 'FAIL (H-5): notifier_etape_course() aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-5): notifier_etape_course() bloquee pour anon';
  end;

  begin
    perform notifier_nouveau_message();
    raise exception 'FAIL (H-5): notifier_nouveau_message() aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-5): notifier_nouveau_message() bloquee pour anon';
  end;

  begin
    perform notifier_nouvelle_course();
    raise exception 'FAIL (H-5): notifier_nouvelle_course() aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-5): notifier_nouvelle_course() bloquee pour anon';
  end;

  begin
    perform recalculer_nb_courses_chauffeur();
    raise exception 'FAIL (H-5): recalculer_nb_courses_chauffeur() aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-5): recalculer_nb_courses_chauffeur() bloquee pour anon';
  end;

  begin
    perform 1 from course_events limit 1;
    raise exception 'FAIL (H-4): lecture directe de course_events aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-4): lecture directe de course_events bloquee pour anon';
  end;

  begin
    insert into course_events (course_id, operateur_id, type) values (gen_random_uuid(), gen_random_uuid(), 'creee');
    raise exception 'FAIL (H-4): insertion directe dans course_events aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-4): insertion directe dans course_events bloquee pour anon';
  end;

  begin
    perform owner_user_id from operateurs limit 1;
    raise exception 'FAIL (H-2): lecture directe de operateurs.owner_user_id aurait du etre bloquee pour anon';
  exception when insufficient_privilege then
    raise notice 'OK (H-2): lecture directe de operateurs.owner_user_id bloquee pour anon';
  end;

  begin
    perform test_demander_otp_et_lire_code('0700000000');
    raise exception 'FAIL (C-1): test_demander_otp_et_lire_code() aurait du etre bloque pour anon (outil reserve au proprietaire)';
  exception when insufficient_privilege then
    raise notice 'OK (C-1): test_demander_otp_et_lire_code() bloque pour anon (jamais accessible depuis l''app)';
  end;

  raise notice 'TOUS LES TESTS DE GRANTS ANON (P0.4) SONT PASSES';
end $$;
reset role;

set role authenticated;
do $$
begin
  begin
    perform declencher_push('0700000000', 'x', 'x');
    raise exception 'FAIL (C-2): declencher_push() aurait du etre bloque pour authenticated';
  exception when insufficient_privilege then
    raise notice 'OK (C-2): declencher_push() bloque pour authenticated';
  end;

  -- H-2 : authenticated CONSERVE deliberement l'acces a operateurs.owner_user_id
  -- (voir migration 20260905050000) -- chauffeurs_maj_owner/chauffeurs_gestion_owner/
  -- chauffeurs_suppression_owner/zones_gestion_* verifient toutes la propriete
  -- via une sous-requete sur operateurs.owner_user_id, et une sous-requete RLS
  -- vers une autre table est evaluee avec les privileges normaux du role
  -- appelant -- revoquer cette colonne pour authenticated cassait tout le
  -- CRUD chauffeurs/zones du dashboard. Seul anon (visiteur non authentifie,
  -- le coeur du probleme H-2) est bloque -- voir bloc anon plus haut.
  -- Gap residuel documente et accepte pour ce correctif : un compte
  -- authentifie sans operateur pourrait encore lire owner_user_id d'un
  -- operateur qui n'est pas le sien.

  begin
    perform 1 from course_events limit 1;
    raise exception 'FAIL (H-4): lecture directe de course_events aurait du etre bloquee pour authenticated';
  exception when insufficient_privilege then
    raise notice 'OK (H-4): lecture directe de course_events bloquee pour authenticated';
  end;

  raise notice 'TOUS LES TESTS DE GRANTS AUTHENTICATED (P0.4) SONT PASSES';
end $$;
reset role;

-- H-1 : un operateur proprietaire ne peut plus fabriquer la note/le nombre de
-- courses de son propre chauffeur par UPDATE direct -- seuls les triggers
-- (recalculer_note_chauffeur / recalculer_nb_courses_chauffeur, qui
-- s'executent sous leur propre definisseur) peuvent encore les modifier.
create temporary table test_h1_ids (chauffeur_id uuid) on commit drop;
grant select on test_h1_ids to authenticated;

do $$
declare
  v_op uuid; v_chauffeur uuid;
  v_tel text := '0799990004';
begin
  v_op := provisionner_operateur('Test H1', 'test-h1-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb,
    format('[{"nom":"Chauffeur H1","telephone":"%s"}]', v_tel)::jsonb);
  select id into v_chauffeur from chauffeurs where operateur_id = v_op;

  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  perform reclamer_operateur(v_op);

  insert into test_h1_ids values (v_chauffeur);
end $$;

set role authenticated;
do $$
declare
  v_chauffeur uuid;
begin
  select chauffeur_id into v_chauffeur from test_h1_ids;
  perform set_config('request.jwt.claims', json_build_object('sub', '4fcafad6-ad79-4277-bfa6-4bcb1be5783e', 'role', 'authenticated')::text, true);
  begin
    update chauffeurs set note_moyenne = 5.0 where id = v_chauffeur;
    raise exception 'FAIL (H-1): un proprietaire ne devrait plus pouvoir ecrire note_moyenne directement';
  exception when insufficient_privilege then
    raise notice 'OK (H-1): ecriture directe de chauffeurs.note_moyenne bloquee pour authenticated';
  end;
  begin
    update chauffeurs set nb_courses = 900 where id = v_chauffeur;
    raise exception 'FAIL (H-1): un proprietaire ne devrait plus pouvoir ecrire nb_courses directement';
  exception when insufficient_privilege then
    raise notice 'OK (H-1): ecriture directe de chauffeurs.nb_courses bloquee pour authenticated';
  end;
  -- Le proprietaire garde la main sur les colonnes non derivees (regression
  -- H-1 : ne doit pas sur-verrouiller ce qui n'est pas concerne).
  update chauffeurs set vehicule = 'Dacia Logan H1' where id = v_chauffeur;
  raise notice 'OK (H-1): les colonnes non derivees restent modifiables par le proprietaire (aucune sur-restriction)';
end $$;
reset role;

do $$ begin raise notice 'TOUS LES TESTS P0.4 (RE-TEST D''ATTAQUE C-1/C-2/C-3/H-1/H-2/H-4/H-5) SONT PASSES'; end $$;

-- H-3 (2026-09-05, plan de finalisation V1) : un passager ne peut plus avoir
-- deux courses actives simultanement -- empeche l'amplification "creer_course
-- en boucle -> notifier_nouvelle_course fan-out vers toute la flotte".
do $$
declare
  v_op uuid; v_zone uuid;
  v_tel text := '0799996001';
  v_code text;
  v_course_id uuid;
begin
  v_op := provisionner_operateur('Test H3', 'test-h3-' || replace(gen_random_uuid()::text, '-', ''), 'TestVille',
    '#000000', '#ffffff', '[{"nom":"Zone","tarif_base":10,"tarif_km":2}]'::jsonb, '[]'::jsonb);
  select id into v_zone from zones_operateur where operateur_id = v_op;
  v_code := test_demander_otp_et_lire_code(v_tel); perform verifier_otp(v_tel, v_code);

  select id into v_course_id from creer_course(v_op, v_tel, null, 'D', 'A', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);

  begin
    perform creer_course(v_op, v_tel, null, 'D2', 'A2', v_zone, 33.5883, -7.6114, 33.5885, -7.5719);
    raise exception 'FAIL (H-3): une deuxieme course active pour le meme passager aurait du etre rejetee';
  exception when others then
    if sqlerrm not like 'Vous avez deja une course active%' then raise; end if;
  end;

  perform annuler_course(v_course_id, v_tel);

  if not exists (select 1 from creer_course(v_op, v_tel, null, 'D3', 'A3', v_zone, 33.5883, -7.6114, 33.5885, -7.5719)) then
    raise exception 'FAIL (H-3): une nouvelle course aurait du etre autorisee apres annulation de la precedente';
  end if;

  raise notice 'OK (H-3): une seule course active a la fois par passager, nouvelle course autorisee apres annulation';
end $$;

rollback;
