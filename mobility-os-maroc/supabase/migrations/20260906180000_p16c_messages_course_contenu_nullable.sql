-- Oubli de la migration p16 : la contrainte CHECK autorisait deja contenu
-- null pour les messages media, mais la colonne elle-meme avait encore sa
-- contrainte NOT NULL d'origine (independante du CHECK) -- d'ou l'erreur
-- "null value in column contenu ... violates not-null constraint" des le
-- premier envoi de photo/vocal en test reel (retour terrain, capture
-- d'ecran a l'appui une fois les erreurs enfin remontees a l'utilisateur).
alter table public.messages_course alter column contenu drop not null;
