-- FOUNDATION V1 -- etape 3 (validee) : correction du hardcode geocodeur.
--
-- Le geocodeur (/api/geocoder) forcait "Casablanca, Maroc" en dur pour
-- absolument toute adresse -- casse deja aujourd'hui pour tout operateur
-- marocain hors agglomeration de Casablanca (Marrakech, Rabat...), pas
-- seulement pour un futur pays.
--
-- Policy de lecture publique sur countries (donnee de reference non
-- sensible : code, nom, devise, prefixe telephonique -- meme niveau de
-- confiance que operateurs, deja public), necessaire pour que le nom du
-- pays de l'operateur soit lisible cote client et derive la requete de
-- geocodage. is_active/is_sandbox restent inchanges : le Senegal reste
-- visible en lecture seule comme metadonnee (nom du pays), mais aucun
-- flux utilisateur production ne l'utilise -- aucun operateur n'a
-- country_id pointant vers le Senegal.
--
-- country_config reste sans aucune policy (toujours vide, non concernee
-- par ce chantier).

create policy "countries_lecture_publique" on public.countries
for select to anon, authenticated
using (true);
