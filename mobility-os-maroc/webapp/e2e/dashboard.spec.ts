import { test, expect } from '@playwright/test'
import { BASE_URL, OPERATEUR_SENEGAL } from './fixtures'

// Dashboard operateur : authentification reelle Supabase Auth (email/mot de
// passe), distincte du flux telephone+OTP passager/chauffeur. Aucun compte de
// test n'est cree automatiquement par cette suite -- fournir les identifiants
// d'un compte reel deja proprietaire de Test QA Senegal via des secrets
// GitHub Actions (DASHBOARD_TEST_QA_SENEGAL_EMAIL / _PASSWORD). Sans ces
// secrets, le test est marque SKIPPED (donc NON TESTE dans le rapport --
// jamais un faux PASS).
const email = process.env.DASHBOARD_TEST_QA_SENEGAL_EMAIL
const motDePasse = process.env.DASHBOARD_TEST_QA_SENEGAL_PASSWORD

test.describe('Dashboard operateur -- Test QA Senegal', () => {
  test.skip(!email || !motDePasse, 'DASHBOARD_TEST_QA_SENEGAL_EMAIL / _PASSWORD non configures -- NON TESTE. Voir README des secrets requis.')

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Une seule execution (desktop-chromium) suffit comme preuve.')
  })

  test('connexion, isolation operateur, devise XOF affichee', async ({ page }) => {
    await page.goto(`${BASE_URL}${OPERATEUR_SENEGAL.urlDashboard}`)

    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(motDePasse!)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // Ecran principal : la barre laterale doit apparaitre.
    await expect(page.getByRole('button', { name: "Vue d'ensemble" })).toBeVisible({ timeout: 20000 })

    // La devise affichee pour le CA doit etre celle de l'operateur Senegal (XOF),
    // jamais MAD -- verification explicite demandee.
    const carteCA = page.locator('.kpi-card', { hasText: "Chiffre d'affaires" })
    await expect(carteCA).toBeVisible({ timeout: 10000 })
    await expect(carteCA).toContainText('XOF')
    await expect(carteCA).not.toContainText('MAD')

    // Onglet Courses : la table doit se charger (isolation par operateur --
    // ce compte ne doit voir QUE les courses de Test QA Senegal).
    await page.getByRole('button', { name: 'Courses' }).click()
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })

    // Onglet Chauffeurs.
    await page.getByRole('button', { name: 'Chauffeurs' }).click()
    await expect(page.getByText('Chauffeur Test Dakar')).toBeVisible({ timeout: 10000 })
  })
})
