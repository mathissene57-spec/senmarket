-- P24 : flotte de test au Senegal, sur demande explicite du client, pour
-- tester le nouvel operateur senegalais de bout en bout (P23) sans passer
-- par l'inscription self-service (pas de session authentifiee reelle
-- disponible depuis cet environnement).
--
-- Meme statut que "Test QA" pour le Maroc : un operateur de TEST, jamais
-- un client reel -- nomme explicitement pour ne jamais etre confondu avec
-- TransAtlas/Toure Transport. country_id = Senegal (P23), zone tarifaire
-- en XOF (pas de defaut MAD herite), un chauffeur pret a se connecter
-- immediatement (statut 'disponible', OTP inutile grace a P21/P22).

insert into public.operateurs (nom, slug, ville, couleur_primaire, couleur_secondaire, actif, country_id)
select 'Test QA Senegal', 'test-qa-senegal', 'Dakar', '#00853F', '#FDEF42', true, c.id
from public.countries c where c.code = 'SN';

insert into public.zones_operateur (operateur_id, nom, tarif_base, tarif_km, currency)
select o.id, 'Centre-ville Dakar', 1000, 250, 'XOF'
from public.operateurs o where o.slug = 'test-qa-senegal';

insert into public.chauffeurs (operateur_id, nom, telephone, vehicule, plaque, statut, type_vehicule, position_lat, position_lng, position_maj_at)
select o.id, 'Chauffeur Test Dakar', '+221771234567', 'Toyota Corolla', 'DK-1234-TE', 'disponible', 'voiture', 14.6928, -17.4467, now()
from public.operateurs o where o.slug = 'test-qa-senegal';
