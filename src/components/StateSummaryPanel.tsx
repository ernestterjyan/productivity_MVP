import { StateBadge } from '@/components/StateBadge'
import { STATE_LABELS } from '@/lib/attention'
import { formatDuration } from '@/lib/time'
import type {
  ActivitySignals,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import { SectionCard } from './SectionCard'

interface StateSummaryPanelProps {
  inference: InferenceSnapshot
  webcam: WebcamSignals
  activity: ActivitySignals
}

export function StateSummaryPanel({
  inference,
  webcam,
  activity,
}: StateSummaryPanelProps) {
  return (
    <SectionCard
      className="state-card"
      title="Current state"
      subtitle="Smoothed attention estimate from webcam posture plus recent interaction."
      actions={<StateBadge state={inference.state} />}
    >
      <div className="state-hero">
        <div>
          <p className="state-hero__label">Live estimate</p>
          <h3>{inference.state.replace('_', ' ').toLowerCase()}</h3>
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

      {inference.candidateState !== inference.state ? (
        <p className="helper-copy">
          Pending candidate: {STATE_LABELS[inference.candidateState]}
        </p>
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
    </SectionCard>
  )
}
