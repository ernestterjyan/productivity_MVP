import type { RefObject } from 'react'
import { CameraBadge } from '@/components/StateBadge'
import { formatClockTime } from '@/lib/time'
import type {
  ActivitySignals,
  SessionStatus,
  WebcamSignals,
} from '@/types/app'
import { SectionCard } from './SectionCard'

interface WebcamPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>
  webcam: WebcamSignals
  activity: ActivitySignals
  previewEnabled: boolean
  sessionStatus: SessionStatus
  calibrationActive: boolean
}

export function WebcamPanel({
  videoRef,
  webcam,
  activity,
  previewEnabled,
  sessionStatus,
  calibrationActive,
}: WebcamPanelProps) {
  return (
    <SectionCard
      className="webcam-card"
      title="Webcam tracking"
      subtitle="Live preview plus raw webcam and in-app activity signals."
      actions={<CameraBadge status={webcam.cameraStatus} />}
    >
      <div className="webcam-stage">
        <video
          ref={videoRef}
          className={`webcam-feed ${!previewEnabled ? 'is-concealed' : ''}`}
          autoPlay
          muted
          playsInline
        />

        {!previewEnabled ? (
          <div className="webcam-overlay">
            Preview hidden. Tracking can continue while the feed stays concealed.
          </div>
        ) : null}

        {sessionStatus === 'IDLE' && !calibrationActive ? (
          <div className="webcam-overlay">
            Start a session to enable the camera and real-time inference.
          </div>
        ) : null}

        {calibrationActive ? (
          <div className="webcam-overlay">
            Calibration is using the local camera feed. No session data is being recorded.
          </div>
        ) : null}
      </div>

      <div className="signal-grid">
        <div className="signal-item">
          <span>Face present</span>
          <strong>{webcam.faceDetected ? 'Yes' : 'No'}</strong>
        </div>
        <div className="signal-item">
          <span>Facing screen</span>
          <strong>{Math.round(webcam.screenFacingScore * 100)}%</strong>
        </div>
        <div className="signal-item">
          <span>Head-down</span>
          <strong>{Math.round(webcam.headDownScore * 100)}%</strong>
        </div>
        <div className="signal-item">
          <span>Last interaction</span>
          <strong>{formatClockTime(activity.lastInteractionAt)}</strong>
        </div>
        <div className="signal-item">
          <span>Keyboard bursts</span>
          <strong>{activity.keyboardEventsPerMinute}/min</strong>
        </div>
        <div className="signal-item">
          <span>Pointer bursts</span>
          <strong>{activity.pointerEventsPerMinute}/min</strong>
        </div>
      </div>
    </SectionCard>
  )
}
