import { test, expect, type Page, type Browser } from '@playwright/test'
import { OPERATEUR_MAROC, OPERATEUR_SENEGAL, telephonePassagerUnique, connecterPassager, connecterChauffeur } from './fixtures'

// Test a DEUX acteurs reels (deux contextes navigateur independants dans le
// meme test) : un onglet passager et un onglet chauffeur, tous deux sur la
// VRAIE app deployee. Le passager cree une course via l'UI (donc via le RPC
// creer_course reel) ; le chauffeur ne fait RIEN de manuel pour la recevoir --
// on attend simplement que son ecran affiche la demande, ce qui ne peut
// arriver que si le canal Realtime (ou son filet de secours en polling 4s)
// livre reellement l'evenement au navigateur. C'est la preuve exigee pour
// Realtime : evenement backend -> reception navigateur -> changement visible
// dans l'interface, sans etape simulee.
//
// connecterPassager/connecterChauffeur vivent dans fixtures.ts -- partagees
// avec gps.spec.ts. Voir le commentaire au-dessus de connecterChauffeur pour
// le finding du run #1 (chemin de connexion silencieuse chauffeur).

async function sAssurerDisponible(page: Page) {
  const toggle = page.locator('button.toggle')
  const classes = (await toggle.getAttribute('class')) || ''
  if (!classes.includes(' on')) {
    await toggle.click()
    await expect(toggle).toHaveClass(/ on/, { timeout: 5000 })
  }
}

// Ce test cree de vraies courses (avec de vraies lignes en base). Une seule
// execution suffit pour en apporter la preuve -- pas la peine de la dupliquer
// par taille d'ecran (c'est le role de responsive.spec.ts).
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Cree de vraies courses -- une seule execution (desktop-chromium) suffit comme preuve.')
})

for (const [nomOperateur, op, prefixeTel] of [
  ['Maroc (Test QA)', OPERATEUR_MAROC, '0700000'],
  ['Senegal (Test QA Senegal)', OPERATEUR_SENEGAL, '780000'],
] as const) {
  test(`Cycle complet passager+chauffeur (Realtime reel) -- ${nomOperateur}`, async ({ browser }: { browser: Browser }) => {
    test.setTimeout(120000)

    const telephonePassager = telephonePassagerUnique(prefixeTel)

    const contextePassager = await browser.newContext()
    const contexteChauffeur = await browser.newContext({
      geolocation: op === OPERATEUR_MAROC
        ? { latitude: op.depart.lat, longitude: op.depart.lng }
        : { latitude: op.depart.lat, longitude: op.depart.lng },
      permissions: ['geolocation'],
    })

    const pagePassager = await contextePassager.newPage()
    const pageChauffeur = await contexteChauffeur.newPage()

    try {
      // 1. Connexion des deux acteurs sur le VRAI operateur de test.
      await connecterChauffeur(pageChauffeur, op.urlChauffeur, op.chauffeurTelephone)
      await sAssurerDisponible(pageChauffeur)
      await connecterPassager(pagePassager, op.urlPassager, telephonePassager)

      // 2. Verification affichage operateur (nom/couleurs/ville) -- P33.
      // La marque de l'operateur (nom) doit apparaitre quelque part sur l'ecran d'accueil.
      await expect(pagePassager.getByText(op.slug === 'test-qa-senegal' ? /Senegal|Dakar/i : /Test QA|Casablanca/i).first()).toBeVisible({ timeout: 10000 })

      // 3. Passager saisit son trajet (mode recherche texte).
      await pagePassager.getByPlaceholder('Adresse ou quartier de départ').fill(op.depart.label)
      await pagePassager.getByPlaceholder('Adresse ou quartier de destination').fill(op.arrivee.label)

      // Le geocodage est debounce (~700ms) -- attendre que "Commander" devienne cliquable
      // plutot qu'un delai arbitraire.
      const boutonCommander = pagePassager.getByRole('button', { name: 'Commander' })
      await expect(boutonCommander).toBeEnabled({ timeout: 15000 })

      // 4. Verification du tarif affiche AVANT de commander (doit montrer la bonne devise).
      await expect(pagePassager.getByText(op.devise)).toBeVisible({ timeout: 5000 })
      if (op.devise === 'XOF') {
        await expect(pagePassager.getByText('MAD')).toHaveCount(0)
      }

      // 5. Commande -- ceci appelle reellement le RPC creer_course.
      await boutonCommander.click()
      await expect(pagePassager.getByText('Recherche d’un chauffeur…')).toBeVisible({ timeout: 15000 })

      // 6. PREUVE REALTIME : le chauffeur ne fait RIEN -- on attend que SA demande
      // apparaisse toute seule sur SON navigateur, livree par le canal reel de l'app
      // (Realtime ou son filet de secours en polling 4s), jamais declenchee par ce test.
      await expect(pageChauffeur.getByText('Nouvelle course')).toBeVisible({ timeout: 30000 })
      await expect(pageChauffeur.getByText(op.devise)).toBeVisible()

      // 7. Le chauffeur accepte -- via l'UI, pas via un appel direct au RPC.
      await pageChauffeur.getByRole('button', { name: 'Accepter' }).click()

      // 8. PREUVE REALTIME (sens inverse) : le passager doit voir le changement de
      // statut sans rien faire, des que le chauffeur a accepte.
      await expect(pagePassager.getByText('Le chauffeur arrive')).toBeVisible({ timeout: 20000 })

      // 9. Chauffeur : prise en charge puis terminaison.
      await pageChauffeur.getByRole('button', { name: 'Je suis arrivé' }).click()
      await expect(pagePassager.getByText('Course en cours')).toBeVisible({ timeout: 20000 })
      await pageChauffeur.getByRole('button', { name: 'Terminer la course' }).click()

      // 10. Passager : notation + verification historique.
      await expect(pagePassager.locator('.stars.center button.star')).toHaveCount(5, { timeout: 20000 })
      await pagePassager.locator('.stars.center button.star').nth(4).click()
      await pagePassager.getByPlaceholder('Un commentaire pour les prochains passagers ? (optionnel)').fill('Test Playwright automatise -- E2E navigateur reel')
      await pagePassager.getByRole('button', { name: 'Terminer' }).click()
      await expect(pagePassager.getByText('Historique')).toBeVisible({ timeout: 10000 })
      await expect(pagePassager.getByText(op.devise).first()).toBeVisible()
      if (op.devise === 'XOF') {
        await expect(pagePassager.getByText('MAD')).toHaveCount(0)
      }

      // 11. Chauffeur : verifier le retour a "disponible".
      await expect(pageChauffeur.getByText('Disponible')).toBeVisible({ timeout: 15000 })
    } finally {
      await contextePassager.close()
      await contexteChauffeur.close()
    }
  })
}
