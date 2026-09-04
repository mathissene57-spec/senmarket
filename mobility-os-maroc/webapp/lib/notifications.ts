// Notifications : deux mécanismes complémentaires.
//
// 1. notifier() : affichage direct depuis la page (via le service worker
//    sur Android, qui refuse `new Notification()` appelé directement --
//    "Illegal constructor"). Ne fonctionne que tant que l'onglet exécute du
//    JS -- pas dès qu'on quitte vraiment le navigateur ou verrouille
//    l'écran (constaté en test réel : les navigateurs mobiles suspendent le
//    JS d'un onglet en arrière-plan au bout de quelques secondes).
//
// 2. subscribeToPush() : vraies push notifications (RFC 8291/8292),
//    envoyées depuis le serveur (trigger Postgres -> edge function
//    send-push) dès qu'un événement pertinent se produit en base --
//    fonctionnent même téléphone verrouillé ou navigateur fermé, car
//    délivrées au service worker par le système d'exploitation, pas par du
//    JS de page qui tournerait en continu.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// À appeler après que la permission Notification soit accordée : crée (ou
// retrouve) l'abonnement push du navigateur et l'enregistre côté serveur,
// associé à ce numéro de téléphone. Sans clé VAPID publique configurée
// (déploiement sans le backend push), ne fait rien -- notifier() reste le
// seul mécanisme actif.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function subscribeToPush(supabase: any, telephone: string) {
  if (typeof window === 'undefined' || !VAPID_PUBLIC_KEY) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }
    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return
    await supabase.rpc('enregistrer_push_subscription', {
      p_telephone: telephone,
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
    })
  } catch {
    // Abonnement push refusé/indisponible (ex: iOS Safari hors PWA
    // installée) -- notifier() reste le repli tant que l'onglet est ouvert.
  }
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
