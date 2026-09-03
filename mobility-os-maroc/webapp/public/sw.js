// Service worker minimal : sert uniquement à afficher des notifications via
// ServiceWorkerRegistration.showNotification(), requis par Chrome mobile
// (Android) qui refuse `new Notification()` appelé directement depuis la
// page. Aucune gestion de push/fetch/cache — ce n'est pas un vrai push
// serveur, juste le relais local nécessaire pour que les notifications
// déclenchées côté client fonctionnent aussi sur mobile.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
