-- P2 (M-1, suite) : nettoyage post-migration 20260905070000.
--
-- CREATE OR REPLACE FUNCTION ne remplace une fonction en place que si sa
-- liste d'arguments (arite + types) est identique. Ajouter un parametre
-- supplementaire (meme avec DEFAULT) sur provisionner_operateur/
-- reclamer_operateur a donc cree une NOUVELLE surcharge a cote de
-- l'ancienne au lieu de la remplacer -- les deux signatures coexistaient
-- en production, ce qui n'est pas l'intention (PostgREST/appels existants
-- auraient pu resoudre l'une ou l'autre selon le nombre d'arguments
-- fournis). On supprime explicitement les anciennes signatures a 7 et 1
-- arguments, ne laissant que les nouvelles (8 et 2 arguments, avec
-- p_generer_invitation/p_token en position finale et DEFAULT) introduites
-- par la migration precedente.
drop function public.provisionner_operateur(text, text, text, text, text, jsonb, jsonb);
drop function public.reclamer_operateur(uuid);
