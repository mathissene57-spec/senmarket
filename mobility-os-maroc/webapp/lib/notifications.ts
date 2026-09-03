// Notifications navigateur (étapes de course + messages reçus). Fonctionnent
// tant que l'onglet reste ouvert, y compris en arrière-plan/appli minimisée —
// pas de vraies push notifications (ça demanderait des clés VAPID et une
// fonction serveur déclenchée à chaque étape, hors scope ici).
//
// Chrome mobile (Android) refuse `new Notification()` appelé directement
// depuis la page ("Illegal constructor" — il exige de passer par un service
// worker). registerServiceWorker()/notifier() gèrent donc les deux chemins :
// ServiceWorkerRegistration.showNotification() quand disponible, sinon repli
// sur le constructeur direct (desktop).
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export function notifier(titre: string, corps: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  const options: NotificationOptions = { body: corps }
  const direct = () => {
    try { new Notification(titre, options) } catch { /* Android : constructeur direct indisponible */ }
  }
  if (!('serviceWorker' in navigator)) { direct(); return }
  // navigator.serviceWorker.ready ne se résout jamais si l'enregistrement a
  // échoué (contexte non sécurisé, etc.) — on borne l'attente pour ne jamais
  // perdre silencieusement une notification.
  const delai = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
  Promise.race([navigator.serviceWorker.ready, delai]).then((reg) => {
    if (reg) (reg as ServiceWorkerRegistration).showNotification(titre, options).catch(direct)
    else direct()
  })
}
