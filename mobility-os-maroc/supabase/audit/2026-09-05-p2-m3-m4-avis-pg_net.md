# P2 : M-3 (avis_courses, exposition publique) et M-4 (pg_net hors schema public)

## M-4 : extension pg_net enregistree dans le schema public

**Constat (advisor Supabase, `extension_in_public`, WARN)** : `pg_net` est
enregistree dans le schema `public` (`pg_extension.extnamespace = public`).

**Tentative de correction** : `alter extension pg_net set schema extensions;`
echoue avec `ERROR: 0A000: extension "pg_net" does not support SET SCHEMA` --
pg_net n'est pas relocalisable (limitation connue et documentee cote
Supabase, qui indique travailler sur une resolution future ; ce n'est pas
une negligence de configuration de ce projet).

**Analyse de risque reel** : les fonctions effectivement appelees par ce
projet (`net.http_post`, utilisee par `declencher_push()` et
`envoyer_sms_otp()`) vivent deja dans leur propre schema dedie `net`, cree
par l'extension elle-meme independamment du schema ou l'extension est
enregistree. Aucun appel du code applicatif ne passe par `public.` pour ces
fonctions. L'exposition reelle de ce WARN est donc cosmetique : elle ne
donne acces a aucune fonction/donnee supplementaire a un role qui n'y
aurait pas deja acces autrement.

**Decision** : ne pas forcer un `DROP EXTENSION` / `CREATE EXTENSION pg_net
SCHEMA extensions` pour contourner la limitation -- cette operation
supprimerait et recreerait les tables de file d'attente internes de pg_net
et pourrait interferer avec la gestion de l'extension par la plateforme
Supabase elle-meme (Database Webhooks, si actives sur ce projet), pour un
gain de securite nul. Gap accepte et documente, a revisiter si Supabase
publie une version relocalisable de pg_net.

## M-3 : avis_courses lisible integralement par anon, sans aucun filtre

**Constat** : `avis_courses (id, course_id, note, commentaire, created_at)`
a une seule policy, `avis_lecture_publique` (`PERMISSIVE`, roles `{public}`,
`cmd SELECT`, `qual = true`) -- absolument aucune restriction. N'importe qui,
sans authentification, peut executer `GET /rest/v1/avis_courses?select=*`
et recuperer en une seule requete (paginable) l'integralite des avis de la
plateforme, tous operateurs confondus, y compris le champ `commentaire`
(texte libre redige par le passager).

**Ce qui est legitime** : afficher les avis d'un chauffeur/operateur est une
fonctionnalite produit normale (comme n'importe quelle marketplace) -- ce
n'est pas la lisibilite en soi qui pose probleme.

**Ce qui ne l'est pas** : (a) aucun filtre de scope (le client peut lire les
avis de tous les operateurs en un seul appel, pas seulement ceux d'un
chauffeur/operateur donne qu'il consulte legitimement) ; (b) le champ libre
`commentaire` peut contenir des informations que le passager n'aurait pas
voulu voir agregees/scrapees en masse (un passager mecontent peut ecrire
des details identifiants dans son commentaire) ; (c) aucune limite de debit
cote PostgREST -- un scraping complet et repete de la table est trivial.

**Decision** : corrige (contrairement a M-4). Verification prealable : un
`grep -r avis_courses webapp/` ne renvoie aucun resultat -- aucune page du
depot n'interroge cette table directement aujourd'hui, donc fermer l'acces
direct ne casse aucune fonctionnalite existante. Decouverte en tentant
d'ajouter une fonction scopee equivalente : `avis_chauffeur(p_chauffeur_id
uuid, p_limite integer)` **existe deja en production** (SECURITY DEFINER,
meme patron que `chauffeurs_operateur()`/`courses_operateur()`, deja
plafonnee entre 1 et 100 avis, deja executable par anon/authenticated) --
elle n'avait simplement jamais ete accompagnee de la fermeture de l'acces
direct a la table brute, qui restait donc un contournement total (lecture
de TOUS les avis de TOUS les operateurs en un seul appel, sans passer par
le scope ni la limite de cette fonction). Migration
`20260905110000_p2_m3_avis_courses_scope_par_chauffeur.sql` : `revoke
select on avis_courses from anon, authenticated`, sans creer de nouvelle
fonction (celle qui existe deja suffit).
