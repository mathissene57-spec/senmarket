// Les erreurs renvoyées par supabase-js (RPC, requêtes de table, storage) ne
// sont pas des instances de la classe Error native — un simple `e instanceof
// Error` échoue silencieusement dessus et masque le vrai message derrière un
// générique "Erreur inconnue", y compris pour des erreurs métier utiles
// (ex. règles RLS/RPC expliquant pourquoi une action est refusée).
export function messageErreur(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m.trim() !== '') return m
  }
  return 'Erreur inconnue'
}

// Certains messages métier renvoyés par les RPC sont déjà clairs et
// actionnables pour un utilisateur final ("point relais inactif", "code de
// retrait invalide") — on les laisse passer tels quels. D'autres exposent
// des détails d'implémentation (nom de paramètre SQL, jargon de version)
// qui n'ont rien à faire devant un utilisateur : on les reformule ici.
const SURCHARGES: [string, string][] = [
  [
    "p_acting_role interdit pour un administrateur",
    "Cette action doit être réalisée par l'acteur opérationnel réel — un compte administrateur ne peut pas s'y substituer.",
  ],
  ["p_acting_role requis pour un appel non-admin", "Votre rôle actuel ne permet pas d'effectuer cette opération."],
  ["p_acting_role invalide", "Votre rôle actuel ne permet pas d'effectuer cette opération."],
  ["p_acting_role doit être", "Votre rôle actuel ne permet pas d'effectuer cette opération."],
  ["p_acting_role", "Votre rôle actuel ne permet pas d'effectuer cette opération."],
  ["non supporté en v1.0", "Cette situation n'est pas encore prise en charge — contactez un administrateur."],
  ["authentification requise", "Veuillez vous reconnecter pour continuer."],
]

// Signaux qu'un message est une fuite technique brute (erreur Postgres/
// PostgREST/réseau non prévue) plutôt qu'un message métier écrit pour
// l'utilisateur : on affiche un message générique plutôt que ce texte.
const SIGNATURES_TECHNIQUES = [
  /^PGRST/i,
  /violates.*constraint/i,
  /duplicate key/i,
  /null value in column/i,
  /^Failed to fetch/i,
  /JWT/i,
  /^ERROR:/,
  /permission denied/i,
]

// Version "vitrine" de messageErreur : ne renvoie jamais un détail
// d'implémentation brut à l'utilisateur, tout en gardant le message
// d'origine dans la console pour le débogage (devtools).
export function messageUtilisateur(e: unknown): string {
  const brut = messageErreur(e)
  if (typeof console !== 'undefined') console.error(e)

  for (const [motif, remplacement] of SURCHARGES) {
    if (brut.includes(motif)) return remplacement
  }
  if (SIGNATURES_TECHNIQUES.some((re) => re.test(brut)) || brut === 'Erreur inconnue') {
    return 'Action non disponible pour le moment. Réessayez ou contactez un administrateur si le problème persiste.'
  }
  return brut
}
