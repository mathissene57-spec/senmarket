-- SenLink — durcissement sécurité, correctif exécution anon
--
-- Rattrapage d'historique git (trouvé lors de l'audit complet du
-- 16/09/2026) : cette migration a été appliquée en direct sur
-- thduksfosaylbjimrgrn le 30/08/2026 (juste après security_hardening) mais
-- son fichier n'avait jamais été commité — écart entre l'état réel de la
-- base et l'historique git, comme celui déjà rattrapé pour
-- container_customs_tracking / public_track_container_customs_status.
-- Contenu retrouvé tel quel via supabase_migrations.schema_migrations
-- (aucune ré-application : déjà en vigueur, vérifié via
-- has_function_privilege — anon=false, authenticated=true pour les deux
-- fonctions ci-dessous, inchangé depuis).

revoke execute on function record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
) from public, anon;
grant execute on function record_shipment_event(
  uuid, text, text, text, numeric, numeric, jsonb, text, text, jsonb
) to authenticated;

revoke execute on function handle_new_user() from public, anon;
