-- P27 : zones tarifaires supplementaires pour Test QA Senegal, pour
-- tester la reservation multi-zone (meme motif que TransAtlas : Centre-
-- ville / Aeroport / Centre, chacune avec son propre tarif_base).

insert into public.zones_operateur (operateur_id, nom, tarif_base, tarif_km, currency)
select o.id, 'Aéroport AIBD', 3000, 300, 'XOF'
from public.operateurs o where o.slug = 'test-qa-senegal';

insert into public.zones_operateur (operateur_id, nom, tarif_base, tarif_km, currency)
select o.id, 'Almadies', 1200, 275, 'XOF'
from public.operateurs o where o.slug = 'test-qa-senegal';
