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
