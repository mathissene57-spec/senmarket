// Service worker : deux rôles.
// 1. Relais pour les notifications déclenchées depuis la page (voir
//    lib/notifications.ts notifier()) -- requis par Chrome Android qui
//    refuse `new Notification()` appelé directement depuis la page.
// 2. Réception des vraies push notifications envoyées par le serveur
//    (edge function send-push) via l'evenement 'push' -- c'est ce qui
//    fonctionne même onglet fermé/téléphone verrouillé, le systeme
//    d'exploitation reveille le service worker independamment de la page.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let titre = 'Mobility OS'
  let corps = ''
  try {
    const data = event.data ? event.data.json() : {}
    titre = data.title || titre
    corps = data.body || ''
  } catch { /* payload non-JSON : on garde le titre par defaut */ }
  event.waitUntil(self.registration.showNotification(titre, { body: corps }))
})

// Sans ceci, taper sur la notification ne fait rien -- l'ecran de la
// course reste invisible tant que le chauffeur ne rouvre pas l'onglet
// lui-meme (delai mesure en test reel : 1 a 3 minutes entre la creation
// de la course et son acceptation). Remettre au premier plan un onglet
// deja ouvert declenche immediatement le rattrapage prevu au retour au
// premier plan (visibilitychange, voir app/chauffeur/page.tsx) au lieu
// d'attendre que l'utilisateur retrouve l'appli par lui-meme.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})
