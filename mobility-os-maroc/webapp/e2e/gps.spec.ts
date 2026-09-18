import { test, expect } from '@playwright/test'
import { BASE_URL, CODE_OTP_MAITRE, OPERATEUR_MAROC } from './fixtures'

// IMPORTANT -- a lire avant d'interpreter ce test comme "GPS reel" :
// ce test verifie que l'app demande et utilise correctement l'API navigateur
// navigator.geolocation.watchPosition (autorisation, reception d'une position,
// affichage cote UI), avec une position MOCKEE par Playwright (contexte
// `geolocation` + `permissions: ['geolocation']`) -- PAS une vraie puce GPS
// d'un appareil physique. C'est la limite honnete de ce qui est automatisable
// en CI. Un vrai test GPS materiel necessite un appareil physique, non
// disponible ici -- voir le rapport final pour la distinction explicite.
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Une seule execution (desktop-chromium) suffit comme preuve.')
})

test('Chauffeur -- geolocalisation acceptee et affichee (mock Playwright, pas un appareil reel)', async ({ browser }) => {
  const context = await browser.newContext({
    geolocation: { latitude: OPERATEUR_MAROC.depart.lat, longitude: OPERATEUR_MAROC.depart.lng },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE_URL}${OPERATEUR_MAROC.urlChauffeur}`)
    await page.locator('input[type="tel"]').fill(OPERATEUR_MAROC.chauffeurTelephone)
    await page.getByRole('button', { name: 'Recevoir un code' }).click()
    await page.getByPlaceholder('123456').fill(CODE_OTP_MAITRE)
    await page.getByRole('button', { name: 'Confirmer et se connecter' }).click()
    await expect(page.locator('button.toggle')).toBeVisible({ timeout: 15000 })

    // watchPosition doit resoudre et l'app doit afficher l'indicateur position (📍)
    // a cote du statut -- preuve que la position mockee a bien ete recue et utilisee.
    await expect(page.getByText('📍')).toBeVisible({ timeout: 15000 })
  } finally {
    await context.close()
  }
})
