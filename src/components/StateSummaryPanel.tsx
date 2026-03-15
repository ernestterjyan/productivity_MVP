import { StateBadge } from '@/components/StateBadge'
import { ATTENTION_STATES, STATE_LABELS } from '@/lib/attention'
import { formatDuration } from '@/lib/time'
import type {
  ActivitySignals,
  InferenceSnapshot,
  ManualOverrideState,
  SessionStatus,
  WebcamSignals,
} from '@/types/app'
import { SectionCard } from './SectionCard'

interface StateSummaryPanelProps {
  inference: InferenceSnapshot
  webcam: WebcamSignals
  activity: ActivitySignals
  sessionStatus: SessionStatus
  manualOverride: ManualOverrideState | null
  onManualCorrection: (state: InferenceSnapshot['state']) => void
  onClearManualCorrection: () => void
}

export function StateSummaryPanel({
  inference,
  webcam,
  activity,
  sessionStatus,
  manualOverride,
  onManualCorrection,
  onClearManualCorrection,
}: StateSummaryPanelProps) {
  return (
    <SectionCard
      className="state-card"
      title="Current state"
      subtitle="Smoothed study-behavior estimate from webcam posture and recent interaction."
      actions={<StateBadge state={inference.state} />}
    >
      <div className="state-hero">
        <div>
          <p className="state-hero__label">Live estimate</p>
          <h3>{STATE_LABELS[inference.state]}</h3>
        </div>
        <div className="confidence-block">
          <span>Confidence</span>
          <strong>{Math.round(inference.confidence * 100)}%</strong>
        </div>
      </div>

      <div className="confidence-meter" aria-hidden="true">
        <div
          className="confidence-meter__fill"
          style={{ width: `${Math.max(8, inference.confidence * 100)}%` }}
        />
      </div>

      <p className="reason-copy">{inference.reason}</p>
      <p className="helper-copy">{inference.transitionReason}</p>

      {manualOverride ? (
        <div className="manual-override-banner">
          <span>Manual correction active</span>
          <button className="ghost-button" onClick={onClearManualCorrection}>
            Return to automatic estimate
          </button>
        </div>
      ) : null}

      <div className="signal-grid compact">
        <div className="signal-item">
          <span>No-face timer</span>
          <strong>{formatDuration(webcam.noFaceDurationMs)}</strong>
        </div>
        <div className="signal-item">
          <span>Yaw proxy</span>
          <strong>{Math.round(webcam.yawBias * 100)}%</strong>
        </div>
        <div className="signal-item">
          <span>Pitch proxy</span>
          <strong>{Math.round(webcam.pitchBias * 100)}%</strong>
        </div>
        <div className="signal-item">
          <span>Recent interaction</span>
          <strong>{activity.recentInteraction ? 'Active' : 'Quiet'}</strong>
        </div>
      </div>

      <div className="manual-controls">
        <p className="manual-controls__label">Manual correction</p>
        <div className="button-row">
          {ATTENTION_STATES.map((state) => (
            <button
              key={state}
              className="secondary-button"
              disabled={sessionStatus !== 'RUNNING'}
              onClick={() => onManualCorrection(state)}
            >
              Mark as {STATE_LABELS[state].toLowerCase()}
            </button>
          ))}
        </div>
        <p className="helper-copy">
          Manual correction affects only the live session. It stores that the segment was user-corrected and helps interpret the timeline more honestly.
        </p>
      </div>
    </SectionCard>
  )
}
