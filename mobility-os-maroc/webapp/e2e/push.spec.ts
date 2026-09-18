import { test } from '@playwright/test'

// Notifications push (Web Push) : tester un vrai push de bout en bout demande
// un service worker enregistre, une souscription reelle aupres du navigateur,
// et un serveur qui declenche l'envoi -- rien de tout cela n'est simulable
// honnetement en CI sans se faire passer pour un "test reel". Conformement a
// la regle posee ("Ne pas simuler un push et l'appeler un test reel"), ce
// test reste explicitement ignore -- NON TESTE dans le rapport, jamais un
// faux PASS.
test.skip(true, 'Notifications push reelles non testables automatiquement (service worker + souscription reelle requis) -- NON TESTE, volontairement, pas simule.')
test('Push -- non teste (voir raison du skip)', () => {})
