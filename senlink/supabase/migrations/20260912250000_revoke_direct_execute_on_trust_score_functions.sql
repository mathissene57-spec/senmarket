-- Même pattern que le trigger de notifications : ces trois fonctions ne
-- servent qu'en interne (deux triggers + une fonction de recalcul appelée
-- par eux et par le backfill de la migration), pas d'usage RPC direct
-- prévu. Un trigger s'exécute sans avoir besoin qu'EXECUTE soit accordé à
-- l'appelant, donc ce revoke ne change rien à leur fonctionnement — juste
-- une surface d'appel RPC en moins (recalculer_trust_score_transporteur
-- n'a aucun contrôle d'accès interne, la laisser ouverte permettrait à
-- n'importe qui de forcer un recalcul arbitraire).
revoke execute on function public.recalculer_trust_score_transporteur(uuid) from public, anon, authenticated;
revoke execute on function public.trg_recalc_trust_score_on_shipment() from public, anon, authenticated;
revoke execute on function public.trg_recalc_trust_score_on_incident() from public, anon, authenticated;
