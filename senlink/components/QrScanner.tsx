'use client'

import { useEffect, useRef, useState } from 'react'
import { messageErreur } from '@/lib/errors'

type QrScannerProps = {
  onScan: (value: string) => void
  onClose: () => void
}

// Scan caméra réel (pas de saisie manuelle) via jsQR — fonctionne sur tous
// les navigateurs modernes contrairement à BarcodeDetector (support natif
// encore partiel, notamment Safari/iOS). Boucle requestAnimationFrame sur
// une frame vidéo capturée dans un canvas caché.
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    import('jsqr').then(({ default: jsQR }) => {
      if (cancelled) return
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            videoRef.current.play().catch(() => {})
          }

          const tick = () => {
            if (cancelled || doneRef.current) return
            const video = videoRef.current
            const canvas = canvasRef.current
            if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const result = jsQR(imageData.data, imageData.width, imageData.height)
                if (result?.data) {
                  doneRef.current = true
                  onScan(result.data)
                  return
                }
              }
            }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        })
        .catch((e) => setErreur(messageErreur(e)))
    })

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.titre}>Scanner le QR du colis</div>
        {erreur ? (
          <div style={styles.erreur}>
            Impossible d&apos;accéder à la caméra.
            <br />
            <small>{erreur}</small>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted style={styles.video} />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button style={styles.fermer} onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(10,26,15,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
  },
  modal: {
    background: '#fff', borderRadius: 16, padding: 20, maxWidth: 360, width: '100%',
    display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
  },
  titre: { fontWeight: 700, fontSize: 15, color: '#0B2418' },
  video: { width: '100%', borderRadius: 10, background: '#000' },
  erreur: { fontSize: 13, color: '#E5484D', textAlign: 'center', padding: '20px 0' },
  fermer: {
    padding: '10px 20px', borderRadius: 8, border: '1px solid #E7E1D3',
    background: '#fff', color: '#0B2418', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
  },
}
