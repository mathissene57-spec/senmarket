-- FOUNDATION V1 -- etape 2 (validee) : operateurs.country_id, backfill Maroc.
--
-- Additif : colonne nullable, aucun RPC ni composant frontend ne la lit ou
-- ne l'ecrit encore (provisionner_operateur / reclamer_operateur restent
-- inchanges -- un nouvel operateur cree aujourd'hui aura simplement
-- country_id = null, sans erreur, tant que ce chantier-la n'est pas
-- explicitement valide). Les 3 operateurs reels (TransAtlas, Toure
-- transport, Test QA) sont backfilles vers Maroc -- aucun changement de
-- comportement observable cote application.

alter table public.operateurs
  add column country_id uuid references public.countries(id);

update public.operateurs
set country_id = (select id from public.countries where code = 'MA')
where country_id is null;

create index if not exists idx_operateurs_country_id on public.operateurs(country_id);
