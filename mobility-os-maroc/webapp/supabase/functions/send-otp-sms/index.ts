// Edge Function : envoie le code OTP par SMS reel au numero fourni.
//
// Appelee uniquement par envoyer_sms_otp() (trigger interne de demander_otp,
// via pg_net) -- jamais directement par un navigateur. Authentification par
// secret partage (x-webhook-secret), lu depuis Supabase Vault, jamais code
// en dur -- meme patron que send-push/index.ts deja en production.
//
// Implementation Twilio par defaut (le fournisseur le plus courant, cite
// dans le plan de finalisation V1). Si SMS_PROVIDER_ACCOUNT_SID/
// SMS_PROVIDER_AUTH_TOKEN/SMS_PROVIDER_FROM_NUMBER ne sont pas presents dans
// Vault, la fonction repond 200 sans rien envoyer (no-op journalise) --
// jamais d'erreur cote appelant, jamais de code en clair ecrit dans un log
// accessible publiquement.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Methode non supportee", { status: 405 })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: secrets } = await supabase.rpc("obtenir_secrets_sms")
  const secretMap = Object.fromEntries((secrets || []).map((s: any) => [s.name, s.decrypted_secret]))

  if (req.headers.get("x-webhook-secret") !== secretMap.SMS_WEBHOOK_SECRET) {
    return new Response("Non autorise", { status: 401 })
  }

  const { telephone, code } = await req.json()
  if (!telephone || !code) return new Response("Requete invalide", { status: 400 })

  const accountSid = secretMap.SMS_PROVIDER_ACCOUNT_SID
  const authToken = secretMap.SMS_PROVIDER_AUTH_TOKEN
  const fromNumber = secretMap.SMS_PROVIDER_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    // Aucun fournisseur SMS configure -- no-op volontaire (voir migration
    // 20260905010000). Ne jamais logger le code en clair ici.
    console.log(`send-otp-sms: aucun fournisseur configure, SMS non envoye pour ${telephone}`)
    return new Response(JSON.stringify({ envoye: false, raison: "fournisseur_non_configure" }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = new URLSearchParams({
    To: telephone,
    From: fromNumber,
    Body: `Votre code Mobility OS : ${code} (valide 5 minutes)`,
  })

  const reponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
    },
    body,
  })

  return new Response(JSON.stringify({ envoye: reponse.ok, statut: reponse.status }), {
    headers: { "Content-Type": "application/json" },
  })
})
