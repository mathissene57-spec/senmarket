import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@/lib/shipment-status'
import { color } from '@/lib/theme'

type Tone = 'neutral' | 'progress' | 'success' | 'danger'

const TONE_BY_STATUS: Record<ShipmentStatus, Tone> = {
  created: 'neutral',
  dropped_off: 'progress',
  inspected: 'progress',
  departed_origin: 'progress',
  in_transit_international: 'progress',
  customs_clearance: 'progress',
  arrived_destination: 'progress',
  at_hub: 'progress',
  at_pickup_point: 'progress',
  out_for_delivery: 'progress',
  delivered: 'success',
  incident: 'danger',
  cancelled: 'danger',
}

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: '#F0EEE7', fg: color.muted },
  progress: { bg: color.goldTint, fg: '#8A6100' },
  success: { bg: color.greenTint, fg: color.green600 },
  danger: { bg: color.dangerTint, fg: color.danger },
}

export function StatusBadge({ status, size = 'md' }: { status: ShipmentStatus; size?: 'sm' | 'md' }) {
  const tone = TONE_BY_STATUS[status] ?? 'neutral'
  const t = TONE_STYLE[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '3px 10px' : '6px 14px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontWeight: 700,
        fontSize: size === 'sm' ? 11 : 13,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className={tone === 'progress' ? 'sl-pulse' : undefined}
        style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }}
      />
      {SHIPMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}
