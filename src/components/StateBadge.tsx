import { STATE_LABELS, STATE_TINTS } from '@/lib/attention'
import type { AttentionState, CameraStatus } from '@/types/app'

interface StateBadgeProps {
  state: AttentionState
}

export function StateBadge({ state }: StateBadgeProps) {
  return (
    <span
      className="state-badge"
      style={{
        color: STATE_TINTS[state],
        backgroundColor: `${STATE_TINTS[state]}18`,
        borderColor: `${STATE_TINTS[state]}33`,
      }}
    >
      {STATE_LABELS[state]}
    </span>
  )
}

export function CameraBadge({ status }: { status: CameraStatus }) {
  const labels: Record<CameraStatus, string> = {
    ACTIVE: 'Camera active',
    PAUSED: 'Camera paused',
    UNAVAILABLE: 'Camera unavailable',
  }
  const tones: Record<CameraStatus, string> = {
    ACTIVE: '#2c7a66',
    PAUSED: '#c28a35',
    UNAVAILABLE: '#c25f52',
  }

  return (
    <span
      className="camera-badge"
      style={{
        color: tones[status],
        backgroundColor: `${tones[status]}18`,
        borderColor: `${tones[status]}30`,
      }}
    >
      <span
        className="camera-badge__dot"
        style={{ backgroundColor: tones[status] }}
      />
      {labels[status]}
    </span>
  )
}
