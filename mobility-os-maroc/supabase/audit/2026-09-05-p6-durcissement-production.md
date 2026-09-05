# P6 : durcissement production (secrets, CORS, storage, realtime)

## Secrets (Supabase Vault)

Contenu actuel : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`PUSH_WEBHOOK_SECRET` (push notifications, deja en place avant ce
chantier). **`SMS_WEBHOOK_SECRET` et `SMS_PROVIDER_ACCOUNT_SID`/
`AUTH_TOKEN`/`FROM_NUMBER` restent absents** -- consequence directe :
`envoyer_sms_otp()` lit `SMS_WEBHOOK_SECRET`, le trouve `null`, et
retourne silencieusement sans jamais appeler `net.http_post` (comportement
voulu, documente depuis C-1). Aucun SMS n'est donc jamais reellement
envoye a ce jour, y compris pour des numeros hors liste de demo -- **statut
inchange, gap deja connu, jamais leve ici** : necessite les identifiants
reels d'un fournisseur SMS (ex. Twilio) fournis par l'utilisateur, jamais
inventes (regle absolue de ce chantier). `SMS_WEBHOOK_SECRET` (secret
interne, pas un identifiant de fournisseur) pourrait techniquement etre
genere sans attendre -- non fait ici car cela ne debloquerait rien tant que
les identifiants du fournisseur manquent, et ajouterait un secret pour
zero gain fonctionnel immediat.

Aucun secret trouve expose par erreur dans le code, les migrations ou les
Edge Functions (grep systematique sur les migrations et `webapp/` --
seules des references `vault.decrypted_secrets`/`Deno.env.get(...)`,
jamais de valeur en dur).

## CORS

Les deux Edge Functions (`send-push`, `send-otp-sms`) n'ont **aucun
en-tete CORS** et **`verify_jwt: false`** (intentionnel : authentification
par secret partage `x-webhook-secret`, jamais par JWT, puisqu'elles ne
sont jamais appelees par un navigateur -- uniquement par `pg_net` depuis
une RPC serveur). Consequence favorable non recherchee mais reelle :
`x-webhook-secret` etant un en-tete personnalise, tout `fetch()` navigateur
vers ces fonctions declenche un preflight CORS ; en l'absence d'en-tete
`Access-Control-Allow-Origin` en reponse, le navigateur bloque l'envoi
reel de la requete -- une page malveillante ne peut donc pas les
declencher depuis le navigateur d'un visiteur, meme sans connaitre le
secret. Aucune action requise.

## Storage

`select * from storage.buckets` renvoie **zero ligne** -- Supabase Storage
n'est pas utilise par ce projet a ce jour. Rien a durcir.

## Realtime

Deja traite en detail sous L-2 (voir
`supabase/audit/2026-09-05-p2-p3-m3-m4-l1-l2.md`) : la policy
`courses_lecture_recente`, necessaire a la livraison Realtime
(`postgres_changes`) vers des apps passager/chauffeur sans session
Supabase Auth, expose publiquement les coordonnees GPS et adresses de
toutes les courses actives/recentes, tous operateurs confondus. Gap
documente et delibere : une correction reelle (migration vers Realtime
Broadcast + Authorization, canaux prives par course) est un changement
d'architecture qui touche schema et frontend, non testable de bout en bout
dans ce bac a sable (reseau bloque vers Supabase, cf. P4). Recommande pour
une iteration post-pilote avec acces reseau complet.

## Verification finale des advisors Supabase

`get_advisors(type=security)` : 56 lints, inchange depuis le dernier
controle (aucune regression introduite par ce chantier) :
- 28 `authenticated_security_definer_function_executable` + 20
  `anon_security_definer_function_executable` (WARN) : intentionnels --
  architecture "guest" du produit (passagers/chauffeurs sans session
  Supabase Auth), chaque fonction verifiee individuellement lors des
  phases P0-P3 (OTP, propriete croisee, etc.).
- 7 `rls_enabled_no_policy` (INFO) : tables volontairement verrouillees
  (RLS active, aucune policy) -- acces exclusivement via RPC
  SECURITY DEFINER, deja le patron documente pour `otp_codes` et
  consorts.
- 1 `extension_in_public` (WARN) : pg_net, non actionnable (cf. M-4).

Aucun nouveau WARN/ERROR de niveau superieur n'est apparu suite aux
migrations P0-P3 de ce chantier.
