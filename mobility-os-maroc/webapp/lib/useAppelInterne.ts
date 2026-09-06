'use client'

import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// Appel interne audio (WebRTC) entre chauffeur et passager -- demande produit :
// remplace l'appel telephonique classique (qui expose le vrai numero de
// chaque partie a l'ecran d'appel natif de l'autre) par un appel qui reste
// entierement dans l'app, sans jamais partager de numero.
//
// Signalisation via un canal Supabase Realtime "broadcast" dedie a la
// course (ephemere, jamais persiste en base -- aucune migration necessaire).
// La connexion audio elle-meme est directe entre les deux navigateurs
// (WebRTC), avec des serveurs STUN publics (gratuits) pour la decouverte
// d'adresse reseau. Volontairement SANS serveur TURN (un relai TURN a un
// cout d'infrastructure et necessiterait un abonnement) : l'appel peut donc
// echouer si les deux parties sont derriere un NAT tres restrictif en meme
// temps, mais fonctionne dans l'immense majorite des cas reels (wifi,
// 4G/5G standard).
const SERVEURS_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const DELAI_SONNERIE_MS = 30000
const DUREE_AFFICHAGE_ERREUR_MS = 4000

export type EtatAppel = 'inactif' | 'sortant' | 'entrant' | 'connecte'

type Signal =
  | { type: 'invite'; nom: string }
  | { type: 'accepte' }
  | { type: 'refuse' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'raccroche' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAppelInterne(supabase: SupabaseClient, courseId: string | null | undefined, monNom: string) {
  const [etat, setEtat] = useState<EtatAppel>('inactif')
  const [correspondant, setCorrespondant] = useState<string | null>(null)
  const [micCoupe, setMicCoupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [dureeSec, setDureeSec] = useState(0)

  // etatRef : les callbacks asynchrones (timeout de sonnerie, gestionnaire
  // du canal broadcast) sont crees une seule fois par course -- sans ref,
  // ils ne verraient jamais que l'etat capture au moment de leur creation
  // (closure figee), jamais les mises a jour ulterieures de `etat`.
  const etatRef = useRef<EtatAppel>('inactif')
  useEffect(() => { etatRef.current = etat }, [etat])

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamLocalRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const candidatsEnAttenteRef = useRef<RTCIceCandidateInit[]>([])
  const minuteurSonnerieRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minuteurDureeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)

  function nettoyer() {
    if (minuteurSonnerieRef.current) { clearTimeout(minuteurSonnerieRef.current); minuteurSonnerieRef.current = null }
    if (minuteurDureeRef.current) { clearInterval(minuteurDureeRef.current); minuteurDureeRef.current = null }
    pcRef.current?.close()
    pcRef.current = null
    streamLocalRef.current?.getTracks().forEach((t) => t.stop())
    streamLocalRef.current = null
    candidatsEnAttenteRef.current = []
    if (audioRef.current) audioRef.current.srcObject = null
    setDureeSec(0)
    setMicCoupe(false)
  }

  function envoyerSignal(payload: Signal) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload })
  }

  function terminerAppelLocal(prevenirAutrePartie: boolean) {
    if (prevenirAutrePartie && etatRef.current !== 'inactif') envoyerSignal({ type: 'raccroche' })
    nettoyer()
    etatRef.current = 'inactif'
    setEtat('inactif')
    setCorrespondant(null)
  }

  // Demande l'acces au micro et cree la connexion WebRTC -- appelee a la
  // fois par l'appelant (des le clic sur "Appeler") et par le destinataire
  // (des le clic sur "Repondre"), jamais en dehors d'un geste utilisateur
  // direct : certains navigateurs (Safari notamment) refusent getUserMedia()
  // hors d'une activation utilisateur synchrone.
  async function creerConnexion() {
    const pc = new RTCPeerConnection({ iceServers: SERVEURS_ICE })
    pcRef.current = pc
    pc.onicecandidate = (e) => { if (e.candidate) envoyerSignal({ type: 'ice', candidate: e.candidate.toJSON() }) }
    pc.ontrack = (e) => { if (audioRef.current) audioRef.current.srcObject = e.streams[0] }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        etatRef.current = 'connecte'
        setEtat('connecte')
        if (!minuteurDureeRef.current) minuteurDureeRef.current = setInterval(() => setDureeSec((d) => d + 1), 1000)
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setErreur('Connexion impossible (réseau trop restrictif).')
        terminerAppelLocal(false)
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamLocalRef.current = stream
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    return pc
  }

  async function demarrerAppel() {
    if (!courseId || etatRef.current !== 'inactif') return
    setErreur(null)
    etatRef.current = 'sortant'
    setEtat('sortant')
    try {
      await creerConnexion()
      envoyerSignal({ type: 'invite', nom: monNom })
      minuteurSonnerieRef.current = setTimeout(() => {
        if (etatRef.current === 'sortant') { setErreur('Pas de réponse.'); terminerAppelLocal(false) }
      }, DELAI_SONNERIE_MS)
    } catch {
      setErreur("Impossible d'accéder au micro.")
      terminerAppelLocal(false)
    }
  }

  async function accepterAppel() {
    if (etatRef.current !== 'entrant') return
    try {
      await creerConnexion()
      envoyerSignal({ type: 'accepte' })
    } catch {
      setErreur("Impossible d'accéder au micro.")
      terminerAppelLocal(true)
    }
  }

  function refuserAppel() {
    if (etatRef.current !== 'entrant') return
    envoyerSignal({ type: 'refuse' })
    etatRef.current = 'inactif'
    setEtat('inactif')
    setCorrespondant(null)
  }

  function raccrocher() { terminerAppelLocal(true) }

  function toggleMic() {
    const nouveau = !micCoupe
    streamLocalRef.current?.getAudioTracks().forEach((t) => { t.enabled = !nouveau })
    setMicCoupe(nouveau)
  }

  useEffect(() => {
    if (!erreur) return
    const t = setTimeout(() => setErreur(null), DUREE_AFFICHAGE_ERREUR_MS)
    return () => clearTimeout(t)
  }, [erreur])

  useEffect(() => {
    if (!courseId) return
    const channel = supabase.channel('appel-course-' + courseId)
    channelRef.current = channel
    channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      if (payload.type === 'invite') {
        // Deja en appel (ou appel en cours d'etablissement) : ignore un
        // second appel entrant plutot que d'ecraser l'etat courant.
        if (etatRef.current !== 'inactif') return
        setCorrespondant(payload.nom)
        etatRef.current = 'entrant'
        setEtat('entrant')
      } else if (payload.type === 'accepte') {
        if (minuteurSonnerieRef.current) { clearTimeout(minuteurSonnerieRef.current); minuteurSonnerieRef.current = null }
        const pc = pcRef.current
        if (!pc) return
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        envoyerSignal({ type: 'offer', sdp: offer })
      } else if (payload.type === 'refuse') {
        setErreur('Appel refusé.')
        terminerAppelLocal(false)
      } else if (payload.type === 'offer') {
        const pc = pcRef.current
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        for (const c of candidatsEnAttenteRef.current) await pc.addIceCandidate(c).catch(() => {})
        candidatsEnAttenteRef.current = []
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        envoyerSignal({ type: 'answer', sdp: answer })
      } else if (payload.type === 'answer') {
        const pc = pcRef.current
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        for (const c of candidatsEnAttenteRef.current) await pc.addIceCandidate(c).catch(() => {})
        candidatsEnAttenteRef.current = []
      } else if (payload.type === 'ice') {
        const pc = pcRef.current
        if (!pc || !pc.remoteDescription) { candidatsEnAttenteRef.current.push(payload.candidate); return }
        await pc.addIceCandidate(payload.candidate).catch(() => {})
      } else if (payload.type === 'raccroche') {
        nettoyer()
        etatRef.current = 'inactif'
        setEtat('inactif')
        setCorrespondant(null)
      }
    }).subscribe()

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      nettoyer()
      etatRef.current = 'inactif'
      setEtat('inactif')
      setCorrespondant(null)
    }
  }, [courseId])

  return { etat, correspondant, micCoupe, erreur, dureeSec, demarrerAppel, accepterAppel, refuserAppel, raccrocher, toggleMic, audioRef }
}
