'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from './supabase/client'

// P2.1 (Operator Resolver) : resout l'operateur soit depuis un slug dans
// l'URL (/o/<slug>/passager, multi-tenant reel), soit depuis la variable
// d'environnement figee au build (routes historiques /passager, /chauffeur,
// /dashboard — inchangees, zero regression pour le pilote existant).
const OPERATEUR_ID_PAR_DEFAUT = process.env.NEXT_PUBLIC_OPERATEUR_ID ?? null

export function useOperateurId() {
  const params = useParams<{ slug?: string }>()
  const slug = params?.slug
  const [operateurId, setOperateurId] = useState<string | null>(slug ? null : OPERATEUR_ID_PAR_DEFAUT)
  const [chargement, setChargement] = useState(!!slug)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setChargement(true)
    setErreur(null)
    const supabase = createClient()
    supabase.from('operateurs').select('id').eq('slug', slug).single().then(({ data, error }) => {
      if (error || !data) { setErreur('Opérateur introuvable.'); setChargement(false); return }
      setOperateurId(data.id)
      setChargement(false)
    })
  }, [slug])

  return { operateurId, chargement, erreur }
}
