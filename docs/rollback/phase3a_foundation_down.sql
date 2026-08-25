-- SenMarket - Rollback de supabase/migrations/20260825120000_phase3a_foundation.sql
--
-- ATTENTION : execution strictement MANUELLE. Ce fichier ne vit pas dans
-- supabase/migrations/ et n'est PAS destine a etre execute automatiquement
-- par `supabase db reset` ou tout autre mecanisme de migration automatique.
--
-- A executer integralement, dans cet ordre (respecte l'ordre inverse des
-- dependances de cles etrangeres). DROP TABLE supprime automatiquement les
-- policies RLS, index, contraintes et privileges de colonne associes a
-- chaque table -- pas besoin de les droper individuellement au prealable.
--
-- Supprime irreversiblement toutes les donnees des tables concernees.
-- Ne pas executer sur un environnement contenant des donnees a conserver
-- sans sauvegarde prealable.

revoke execute on function public.creer_commande_complete(uuid, jsonb, text, text) from anon, authenticated;
drop function if exists public.creer_commande_complete(uuid, jsonb, text, text);

drop table if exists public.commande_lignes;
drop table if exists public.commandes;
drop sequence if exists public.commande_seq;
drop table if exists public.produits;
drop table if exists public.boutiques;
drop table if exists public.categories;
drop table if exists public.devises;
