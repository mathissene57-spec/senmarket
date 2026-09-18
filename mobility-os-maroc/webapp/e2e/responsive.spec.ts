import { test, expect } from '@playwright/test'
import { BASE_URL, OPERATEUR_MAROC, OPERATEUR_SENEGAL } from './fixtures'

// Tourne automatiquement sur les deux projets definis dans playwright.config.ts
// (mobile-chromium = Pixel 7, desktop-chromium = Desktop Chrome) -- donc ce
// fichier a lui seul couvre a la fois mobile et desktop. Verifie l'absence de
// debordement horizontal et la visibilite des elements cles, sur l'app REELLEMENT
// deployee (aucune capture ni supposition sur le rendu).

for (const [nom, op] of [
  ['Maroc (Test QA)', OPERATEUR_MAROC],
  ['Senegal (Test QA Senegal)', OPERATEUR_SENEGAL],
] as const) {
  test(`Passager -- pas de debordement horizontal, elements cles visibles -- ${nom}`, async ({ page }) => {
    await page.goto(`${BASE_URL}${op.urlPassager}`)
    const champTel = page.locator('input[type="tel"]')
    await expect(champTel).toBeVisible({ timeout: 20000 })

    // Pas de scroll horizontal sur la page de connexion.
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(debordement).toBe(false)

    // Zone tactile minimale (44px recommande) sur le bouton principal.
    const bouton = page.getByRole('button', { name: 'Recevoir un code' })
    await expect(bouton).toBeVisible()
    const boite = await bouton.boundingBox()
    expect(boite).not.toBeNull()
    expect(boite!.height).toBeGreaterThanOrEqual(32)
  })

  test(`Chauffeur -- pas de debordement horizontal -- ${nom}`, async ({ page }) => {
    await page.goto(`${BASE_URL}${op.urlChauffeur}`)
    await expect(page.locator('input[type="tel"]')).toBeVisible({ timeout: 20000 })
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(debordement).toBe(false)
  })
}
