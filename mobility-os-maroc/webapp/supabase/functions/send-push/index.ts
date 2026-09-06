// Edge Function : envoie une vraie notification push web (RFC 8291/8292) a
// tous les abonnements enregistres pour un numero de telephone donne.
//
// Appelee uniquement par des triggers Postgres (via pg_net) sur changement
// d'etape de course, nouveau message ou nouvelle course en recherche --
// jamais directement par un navigateur. verify_jwt est desactive car
// l'appelant n'est pas un utilisateur authentifie Supabase mais la base de
// donnees elle-meme ; l'authentification se fait via un secret partage
// (x-webhook-secret), lu depuis Supabase Vault, jamais code en dur.
//
// Implementation manuelle (Web Crypto natif, aucune dependance npm) car
// l'environnement d'edge functions Deno ne garantit pas la compatibilite
// des bibliotheques Node comme `web-push` (modules crypto/https internes).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

function base64UrlToBytes(b64url: string): Uint8Array {
  const padding = "=".repeat((4 - (b64url.length % 4)) % 4)
  const b64 = (b64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let str = ""
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { result.set(a, offset); offset += a.length }
  return result
}

// JWT VAPID (ES256) prouvant au service de push (FCM, Mozilla push, etc.)
// que l'envoi provient bien du serveur associe a la cle publique fournie
// lors de l'abonnement cote navigateur.
async function construireEnteteVapid(endpoint: string, vapidPublicRaw: Uint8Array, vapidPrivateD: string): Promise<string> {
  const aud = new URL(endpoint).origin
  const entete = { typ: "JWT", alg: "ES256" }
  const maintenant = Math.floor(Date.now() / 1000)
  const payload = { aud, exp: maintenant + 12 * 3600, sub: "mailto:contact@mobilityos.ma" }
  const encEntete = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(entete)))
  const encPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const nonSigne = `${encEntete}.${encPayload}`

  const x = bytesToBase64Url(vapidPublicRaw.slice(1, 33))
  const y = bytesToBase64Url(vapidPublicRaw.slice(33, 65))
  const jwk = { kty: "EC", crv: "P-256", d: vapidPrivateD, x, y, ext: true }
  const cle = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, new TextEncoder().encode(nonSigne))
  const encSignature = bytesToBase64Url(new Uint8Array(signature))
  const jwt = `${nonSigne}.${encSignature}`
  const vapidPublicB64 = bytesToBase64Url(vapidPublicRaw)
  return `vapid t=${jwt}, k=${vapidPublicB64}`
}

// Chiffrement du message (RFC 8291, aes128gcm) avec la cle publique ECDH et
// le secret d'authentification fournis par le navigateur lors de
// l'abonnement (subscription.p256dh / subscription.auth).
async function chiffrerCharge(texte: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const uaPublicRaw = base64UrlToBytes(p256dhB64)
  const authSecret = base64UrlToBytes(authB64)

  const pairServeur = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pairServeur.publicKey))

  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const secretPartageBits = await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, pairServeur.privateKey, 256)
  const secretPartage = new Uint8Array(secretPartageBits)

  const cleIkm = await crypto.subtle.importKey("raw", secretPartage, "HKDF", false, ["deriveBits"])
  const infoAuth = concatBytes([new TextEncoder().encode("WebPush: info\0"), uaPublicRaw, asPublicRaw])
  const ikmBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: authSecret, info: infoAuth }, cleIkm, 256)
  const ikm = new Uint8Array(ikmBits)

  const sel = crypto.getRandomValues(new Uint8Array(16))
  const cleIkm2 = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  const infoCek = new TextEncoder().encode("Content-Encoding: aes128gcm\0")
  const cekBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel, info: infoCek }, cleIkm2, 128)
  const cek = new Uint8Array(cekBits)
  const infoNonce = new TextEncoder().encode("Content-Encoding: nonce\0")
  const nonceBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel, info: infoNonce }, cleIkm2, 96)
  const nonce = new Uint8Array(nonceBits)

  const clair = concatBytes([new TextEncoder().encode(texte), new Uint8Array([2])])
  const cleCek = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cleCek, clair))

  const entete = new Uint8Array(16 + 4 + 1 + 65)
  entete.set(sel, 0)
  new DataView(entete.buffer).setUint32(16, 4096, false)
  entete[20] = 65
  entete.set(asPublicRaw, 21)

  return concatBytes([entete, chiffre])
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Methode non supportee", { status: 405 })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Le schema vault n'est jamais expose via l'API REST -- on passe par une
  // RPC dediee, reservee au role service (voir migration
  // rpc_secrets_push_notifications), jamais accessible a un navigateur.
  const { data: secrets } = await supabase.rpc("obtenir_secrets_push_notifications")

  const secretMap = Object.fromEntries((secrets || []).map((s: any) => [s.name, s.decrypted_secret]))
  if (req.headers.get("x-webhook-secret") !== secretMap.PUSH_WEBHOOK_SECRET) {
    return new Response("Non autorise", { status: 401 })
  }

  const { telephone, titre, corps, url } = await req.json()
  if (!telephone || !titre) return new Response("Requete invalide", { status: 400 })

  const { data: abonnements } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("telephone", telephone)

  const vapidPublicRaw = base64UrlToBytes(secretMap.VAPID_PUBLIC_KEY)
  // `url` : chemin de l'app a rouvrir si aucun onglet n'est deja ouvert (voir
  // sw.js notificationclick) -- sans lui, taper sur la notification ramenait
  // systematiquement sur la page d'accueil generique au lieu du tableau de
  // bord chauffeur/passager concerne.
  const chargeJson = JSON.stringify({ title: titre, body: corps || "", url: url || "/" })

  const resultats = await Promise.all((abonnements || []).map(async (abo: any) => {
    try {
      const corpsChiffre = await chiffrerCharge(chargeJson, abo.p256dh, abo.auth)
      const enteteVapid = await construireEnteteVapid(abo.endpoint, vapidPublicRaw, secretMap.VAPID_PRIVATE_KEY)
      const reponse = await fetch(abo.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          "TTL": "60",
          "Authorization": enteteVapid,
        },
        body: corpsChiffre,
      })
      // 404/410 : l'abonnement n'existe plus cote navigateur (appli
      // desinstallee, permission revoquee...) -- on nettoie la table.
      if (reponse.status === 404 || reponse.status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", abo.id)
      }
      return { id: abo.id, statut: reponse.status }
    } catch (e) {
      return { id: abo.id, erreur: String(e) }
    }
  }))

  return new Response(JSON.stringify({ envoyes: resultats.length, resultats }), {
    headers: { "Content-Type": "application/json" },
  })
})
