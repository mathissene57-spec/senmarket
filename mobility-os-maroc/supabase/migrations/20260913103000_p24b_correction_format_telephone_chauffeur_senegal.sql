-- P24b : correction immediate -- le chauffeur de test senegalais (P24)
-- avait ete seede avec un numero au format E.164 (+221771234567), alors
-- que TOUS les numeros marocains existants (TransAtlas, Toure Transport,
-- Test QA) sont stockes en format local sans indicatif (ex: 0612345678)
-- -- le meme format que celui que l'utilisateur tape naturellement dans
-- le champ telephone de l'app (aucune normalisation/indicatif n'est
-- ajoute cote client, connexion_chauffeur() fait une correspondance
-- exacte). Constate en direct : connexion impossible avec "771234567"
-- (ce que l'utilisateur a reellement tape) contre "+221771234567" stocke.
--
-- Corrige en adoptant le meme format local que le Maroc (sans indicatif)
-- pour ce chauffeur de test. Idempotent si deja applique (l'UPDATE ne
-- trouve alors aucune ligne a l'ancien format).
update public.chauffeurs set telephone = '771234567'
where operateur_id = (select id from public.operateurs where slug = 'test-qa-senegal')
  and telephone = '+221771234567';
