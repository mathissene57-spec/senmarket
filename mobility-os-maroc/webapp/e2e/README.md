# Suite E2E navigateur reel -- Mobility OS

Tourne contre l'app **reellement deployee** sur Vercel (jamais un serveur local), via GitHub Actions (`../../.github/workflows/mobility-os-e2e.yml`), parce que le sandbox Claude Code n'a aucune sortie reseau vers `vercel.app`/`supabase.co` (verifie avec un vrai navigateur Chromium le 18/09/2026 -- `net::ERR_TUNNEL_CONNECTION_FAILED`).

Scope volontaire : uniquement les operateurs de test **Test QA** (Maroc) et **Test QA Senegal** -- jamais TransAtlas/Toure Transport.

## Lancer manuellement

Dans GitHub -> Actions -> "Mobility OS -- E2E navigateur reel (Playwright)" -> Run workflow.

En local (avec un vrai acces reseau) :
```bash
cd mobility-os-maroc/webapp
npm install
npx playwright install --with-deps chromium
npx playwright test
```

## Secrets requis (optionnel)

| Secret GitHub | Requis pour | Sans lui |
|---|---|---|
| `DASHBOARD_TEST_QA_SENEGAL_EMAIL` | `dashboard.spec.ts` | Test marque **skipped** (NON TESTE), jamais un faux PASS |
| `DASHBOARD_TEST_QA_SENEGAL_PASSWORD` | `dashboard.spec.ts` | idem |

Ces identifiants doivent etre ceux d'un compte Supabase Auth reel deja proprietaire de l'operateur "Test QA Senegal" (`owner_user_id` deja renseigne). Cette suite n'en cree jamais automatiquement -- fournir un compte existant, ou en creer un manuellement via `/o/test-qa-senegal/dashboard` (inscription) puis le reclamer.

## Fichiers

| Fichier | Couvre |
|---|---|
| `cycle-complet.spec.ts` | Passager + Chauffeur + preuve Realtime (deux navigateurs independants, aucune etape manuelle cote reception), Maroc et Senegal |
| `dashboard.spec.ts` | Connexion dashboard, isolation par operateur, devise XOF affichee -- necessite les secrets ci-dessus |
| `responsive.spec.ts` | Absence de debordement horizontal + zones tactiles, sur mobile (Pixel 7) ET desktop (deux projets Playwright) |
| `gps.spec.ts` | Autorisation + reception + affichage d'une position geolocalisee **mockee par Playwright** -- pas un appareil physique reel, voir le commentaire en tete de fichier |
| `push.spec.ts` | Volontairement `test.skip` -- notifications push reelles non automatisables honnetement, jamais simulees |

## Lire le rapport

Le rapport HTML complet (captures d'ecran et videos sur echec, traces Playwright) est publie comme artefact `mobility-os-e2e-report` du run GitHub Actions. Un resume tableau (reussis/echoues/ignores) apparait aussi dans le "Job Summary" du run.
