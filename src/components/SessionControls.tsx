import { ATTENTION_STATES, STATE_LABELS } from '@/lib/attention'
import { formatDuration } from '@/lib/time'
import type { LiveSession, SessionStatus } from '@/types/app'
import { SectionCard } from './SectionCard'

interface SessionControlsProps {
  currentSession: LiveSession | null
  sessionStatus: SessionStatus
  busy: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onReset: () => void
}

export function SessionControls({
  currentSession,
  sessionStatus,
  busy,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
}: SessionControlsProps) {
  const totals = currentSession?.totals

  return (
    <SectionCard
      className="session-card"
      title="Live session"
      subtitle="Start, pause, resume, or reset the current tracking window."
      actions={
        <div className="button-row">
          {sessionStatus === 'IDLE' ? (
            <button className="primary-button" disabled={busy} onClick={onStart}>
              Start session
            </button>
          ) : null}
          {sessionStatus === 'RUNNING' ? (
            <button className="secondary-button" disabled={busy} onClick={onPause}>
              Pause
            </button>
          ) : null}
          {sessionStatus === 'PAUSED' ? (
            <button className="primary-button" disabled={busy} onClick={onResume}>
              Resume
            </button>
          ) : null}
          {sessionStatus !== 'IDLE' ? (
            <>
              <button className="secondary-button" disabled={busy} onClick={onStop}>
                Stop
              </button>
              <button className="ghost-button" disabled={busy} onClick={onReset}>
                Reset
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="timer-value">
        {formatDuration(currentSession?.elapsedMs ?? 0)}
      </div>

      <div className="metric-grid">
        {ATTENTION_STATES.map((state) => (
          <article key={state} className="metric-tile">
            <span>{STATE_LABELS[state]}</span>
            <strong>{formatDuration(totals?.[state] ?? 0)}</strong>
          </article>
        ))}
      </div>

      <p className="helper-copy">
        The timer tracks estimated study behavior states while the session is
        running. Paused time is excluded.
      </p>
    </SectionCard>
  )
}
