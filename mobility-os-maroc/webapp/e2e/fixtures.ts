import { expect, type Page } from '@playwright/test'

// Donnees de test partagees par les specs Playwright -- exclusivement les
// operateurs de test (Test QA / Test QA Senegal), jamais TransAtlas/Toure.
// Le code OTP maitre '000000' fonctionne pour n'importe quel numero tant que
// la verification reelle reste desactivee (voir CLAUDE.md / migrations P21-P22).

export const CODE_OTP_MAITRE = '000000'

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mobility-os-maroc-git.vercel.app'

export const OPERATEUR_MAROC = {
  slug: 'test-qa',
  urlPassager: '/o/test-qa/passager',
  urlChauffeur: '/o/test-qa/chauffeur',
  urlDashboard: '/o/test-qa/dashboard',
  devise: 'MAD',
  chauffeurTelephone: '0787654321',
  depart: { lat: 33.5898, lng: -7.6116, label: 'Place Mohammed V, Casablanca' },
  arrivee: { lat: 33.5960, lng: -7.6650, label: 'Ain Diab, Casablanca' },
}

export const OPERATEUR_SENEGAL = {
  slug: 'test-qa-senegal',
  urlPassager: '/o/test-qa-senegal/passager',
  urlChauffeur: '/o/test-qa-senegal/chauffeur',
  urlDashboard: '/o/test-qa-senegal/dashboard',
  devise: 'XOF',
  chauffeurTelephone: '771234567',
  depart: { lat: 14.6708, lng: -17.4380, label: 'Plateau, Dakar' },
  arrivee: { lat: 14.7167, lng: -17.4900, label: 'Almadies, Dakar' },
}

// Numero passager unique par run (horodatage) pour ne jamais entrer en
// conflit avec la regle "vous avez deja une course active" d'un run precedent
// qui n'aurait pas termine proprement sa course de test.
export function telephonePassagerUnique(prefixe: string): string {
  const suffixe = Date.now().toString().slice(-8)
  return `${prefixe}${suffixe}`
}

export async function connecterPassager(page: Page, urlPassager: string, telephone: string) {
  await page.goto(`${BASE_URL}${urlPassager}`)
  const champTel = page.locator('input[type="tel"]')
  await expect(champTel).toBeVisible({ timeout: 20000 })
  await champTel.fill(telephone)
  const champNom = page.getByPlaceholder('Votre nom')
  if (await champNom.isVisible().catch(() => false)) {
    await champNom.fill('Audit E2E Playwright')
  }
  await page.getByRole('button', { name: 'Recevoir un code' }).click()
  const champCode = page.getByPlaceholder('123456')
  await expect(champCode).toBeVisible({ timeout: 10000 })
  await champCode.fill(CODE_OTP_MAITRE)
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
  // Ecran d'accueil : le champ d'adresse de depart doit apparaitre.
  await expect(page.getByPlaceholder('Adresse ou quartier de départ')).toBeVisible({ timeout: 15000 })
}

// IMPORTANT -- trouve pendant le run #1 (18/09/2026) : contrairement au
// passager, demanderOtp() cote chauffeur (app/chauffeur/page.tsx, L410-418)
// tente D'ABORD une connexion silencieuse (seConnecter(true) -> RPC
// connexion_chauffeur direct). Tant que la verification OTP reste desactivee
// GLOBALEMENT sur la plateforme (est_telephone_verifie() retourne toujours
// true), cette tentative reussit systematiquement des le premier clic sur
// "Recevoir un code" -- l'ecran de saisie du code n'apparait alors JAMAIS.
// Comportement reel et voulu de l'app (voir le commentaire P20 dans le code
// source), pas un defaut. On attend donc l'un OU l'autre ecran, sans
// presumer lequel apparaitra -- jamais un delai arbitraire, toujours une
// vraie condition observee dans le DOM.
export async function connecterChauffeur(page: Page, urlChauffeur: string, telephone: string) {
  await page.goto(`${BASE_URL}${urlChauffeur}`)
  const champTel = page.locator('input[type="tel"]')
  await expect(champTel).toBeVisible({ timeout: 20000 })
  await champTel.fill(telephone)
  await page.getByRole('button', { name: 'Recevoir un code' }).click()

  const champCode = page.getByPlaceholder('123456')
  const toggleDispo = page.locator('button.toggle')

  await Promise.race([
    champCode.waitFor({ state: 'visible', timeout: 20000 }),
    toggleDispo.waitFor({ state: 'visible', timeout: 20000 }),
  ])

  if (await champCode.isVisible().catch(() => false)) {
    // Chemin normal (OTP demande) : verifier avec le code maitre.
    await champCode.fill(CODE_OTP_MAITRE)
    await page.getByRole('button', { name: 'Confirmer et se connecter' }).click()
  }
  // Chemin court (connexion silencieuse reussie) : rien a faire de plus --
  // on verifie juste, dans les deux cas, que l'ecran d'accueil est bien atteint.
  await expect(toggleDispo).toBeVisible({ timeout: 15000 })
}
