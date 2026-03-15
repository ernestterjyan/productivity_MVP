import { StateBadge } from '@/components/StateBadge'
import { formatDuration } from '@/lib/time'
import type {
  ActivitySignals,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import { SectionCard } from './SectionCard'

interface DebugSignalsPanelProps {
  inference: InferenceSnapshot
  webcam: WebcamSignals
  activity: ActivitySignals
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function DebugSignalsPanel({
  inference,
  webcam,
  activity,
}: DebugSignalsPanelProps) {
  return (
    <SectionCard
      className="debug-card"
      title="Debug mode"
      subtitle="Raw signals for tuning thresholds during development."
      actions={<StateBadge state={inference.state} />}
    >
      <details className="debug-details">
        <summary>Show raw attention signals</summary>

        <div className="debug-grid">
          <article className="signal-item">
            <span>Face detected</span>
            <strong>{webcam.faceDetected ? 'Yes' : 'No'}</strong>
          </article>
          <article className="signal-item">
            <span>Orientation score</span>
            <strong>{formatPercent(webcam.screenFacingScore)}</strong>
          </article>
          <article className="signal-item">
            <span>Head-down score</span>
            <strong>{formatPercent(webcam.headDownScore)}</strong>
          </article>
          <article className="signal-item">
            <span>Recent activity</span>
            <strong>
              {activity.recentInteraction
                ? `Yes · k:${activity.recentKeyboard ? 'y' : 'n'} · p:${activity.recentPointer ? 'y' : 'n'}`
                : 'No'}
            </strong>
          </article>
          <article className="signal-item">
            <span>No-face duration</span>
            <strong>{formatDuration(webcam.noFaceDurationMs)}</strong>
          </article>
          <article className="signal-item">
            <span>Inferred state</span>
            <strong>{inference.state.replace('_', ' ')}</strong>
          </article>
        </div>
      </details>
    </SectionCard>
  )
}
