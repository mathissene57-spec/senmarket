import { defineConfig, devices } from '@playwright/test'

// Suite E2E "vrai navigateur" pour Mobility OS -- tourne contre l'app REELLEMENT
// deployee sur Vercel (jamais un serveur local), depuis un environnement avec
// acces reseau reel (GitHub Actions), pas depuis le sandbox Claude qui n'a pas
// de sortie internet. Voir .github/workflows/mobility-os-e2e.yml.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://mobility-os-maroc-git.vercel.app'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    geolocation: { latitude: 33.5731, longitude: -7.5898 }, // Casablanca, pour les tests qui accordent le GPS
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
