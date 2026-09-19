-- PostgreSQL accorde EXECUTE à PUBLIC (donc anon) par défaut à la création
-- d'une fonction. Repéré via les advisors sécurité juste après leur ajout,
-- même pattern déjà appliqué ailleurs (notify_client_on_shipment_event,
-- fonctions Trust Score) : ces deux RPC sont déjà protégées par is_admin()
-- en interne, mais autant fermer explicitement l'accès anon/PUBLIC plutôt
-- que de compter uniquement sur la vérification applicative.
revoke execute on function public.admin_list_agent_point_relais() from public, anon;
revoke execute on function public.admin_assign_agent_point_relais(text, uuid, uuid) from public, anon;
