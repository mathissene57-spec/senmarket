-- FOUNDATION V1 -- etape 4 : currency sur courses / zones_operateur /
-- trajets_intervilles.
--
-- Additif : defaut 'MAD' partout, ecrite une seule fois a la creation,
-- jamais recalculee a posteriori sur l'historique existant (coherent avec
-- la regle deja appliquee dans ce schema de ne jamais corriger l'historique
-- -- cf. commande_items du projet soeur). Aucun RPC ni composant frontend
-- ne la lit encore : le comportement observable des 269 courses et des
-- tarifs existants est strictement inchange.

alter table public.courses               add column currency text not null default 'MAD';
alter table public.zones_operateur       add column currency text not null default 'MAD';
alter table public.trajets_intervilles   add column currency text not null default 'MAD';
