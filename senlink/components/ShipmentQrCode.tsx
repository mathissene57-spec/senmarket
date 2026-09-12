'use client'

import { useEffect, useRef } from 'react'

type ShipmentQrCodeProps = {
  value: string
  size?: number
}

export function ShipmentQrCode({ value, size = 160 }: ShipmentQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled || !canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 })
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 8 }} />
}
