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
  const { debug } = inference

  return (
    <SectionCard
      className="debug-card"
      title="Debug mode"
      subtitle="Raw signals, thresholds, and promotion timers for heuristic tuning."
      actions={<StateBadge state={inference.state} />}
    >
      <details className="debug-details">
        <summary>Show raw attention and transition internals</summary>

        <div className="debug-grid">
          <article className="signal-item">
            <span>Face detected</span>
            <strong>{webcam.faceDetected ? 'Yes' : 'No'}</strong>
          </article>
          <article className="signal-item">
            <span>Screen-facing score</span>
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
            <span>Confidence</span>
            <strong>{formatPercent(inference.confidence)}</strong>
          </article>
          <article className="signal-item">
            <span>Stable state</span>
            <strong>{debug.stableState.replace('_', ' ')}</strong>
          </article>
          <article className="signal-item">
            <span>Candidate state</span>
            <strong>{debug.candidateState.replace('_', ' ')}</strong>
          </article>
          <article className="signal-item">
            <span>Pending state</span>
            <strong>{debug.pendingState?.replace('_', ' ') ?? 'None'}</strong>
          </article>
          <article className="signal-item">
            <span>Remaining hold</span>
            <strong>{formatDuration(debug.remainingHoldMs)}</strong>
          </article>
          <article className="signal-item">
            <span>Cooldown remaining</span>
            <strong>{formatDuration(debug.cooldownRemainingMs)}</strong>
          </article>
          <article className="signal-item">
            <span>Calibration active</span>
            <strong>{debug.calibrationActive ? 'Yes' : 'No'}</strong>
          </article>
        </div>

        <p className="reason-copy">{inference.transitionReason}</p>

        <div className="signal-grid compact">
          <article className="signal-item">
            <span>Manual override</span>
            <strong>{debug.manualOverrideState?.replace('_', ' ') ?? 'None'}</strong>
          </article>
          <article className="signal-item">
            <span>Hold target</span>
            <strong>{formatDuration(debug.requiredHoldMs)}</strong>
          </article>
          <article className="signal-item">
            <span>Threshold: screen</span>
            <strong>{debug.thresholds.screenFacingThreshold.toFixed(2)}</strong>
          </article>
          <article className="signal-item">
            <span>Threshold: head-down</span>
            <strong>{debug.thresholds.headDownThreshold.toFixed(2)}</strong>
          </article>
          <article className="signal-item">
            <span>Threshold: desk work ceiling</span>
            <strong>{debug.thresholds.deskWorkScreenFacingUpperBound.toFixed(2)}</strong>
          </article>
          <article className="signal-item">
            <span>Threshold: away timeout</span>
            <strong>{formatDuration(debug.thresholds.awayTimeoutMs)}</strong>
          </article>
        </div>

        <div className="signal-grid compact">
          <article className="signal-item">
            <span>Flag: on-screen candidate</span>
            <strong>{debug.flags.onScreenCandidate ? 'Yes' : 'No'}</strong>
          </article>
          <article className="signal-item">
            <span>Flag: desk-work candidate</span>
            <strong>{debug.flags.deskWorkCandidate ? 'Yes' : 'No'}</strong>
          </article>
          <article className="signal-item">
            <span>Flag: away candidate</span>
            <strong>{debug.flags.awayCandidate ? 'Yes' : 'No'}</strong>
          </article>
          <article className="signal-item">
            <span>Flag: turned away</span>
            <strong>{debug.flags.clearlyTurnedAway ? 'Yes' : 'No'}</strong>
          </article>
        </div>
      </details>
    </SectionCard>
  )
}
