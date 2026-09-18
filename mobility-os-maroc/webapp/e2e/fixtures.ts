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
