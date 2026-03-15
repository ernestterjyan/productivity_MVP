import { STATE_LABELS, STATE_TINTS } from '@/lib/attention'
import { formatDayLabel, formatDuration, formatLocalDateTime } from '@/lib/time'
import type { DailySummary, LiveSession } from '@/types/app'
import { SectionCard } from './SectionCard'

interface TimelinePanelProps {
  currentSession: LiveSession | null
  dailyHistory: DailySummary[]
}

export function TimelinePanel({
  currentSession,
  dailyHistory,
}: TimelinePanelProps) {
  const elapsed = currentSession?.elapsedMs ?? 0
  const recentDays = dailyHistory.slice(0, 5)

  return (
    <div className="wide-row">
      <SectionCard
        className="timeline-card"
        title="Timeline"
        subtitle="Current session state segments with a quick look at recent days."
      >
        {currentSession && currentSession.segments.length > 0 ? (
          <>
            <div className="timeline-strip">
              {currentSession.segments.map((segment) => {
                const width = elapsed > 0 ? (segment.durationMs / elapsed) * 100 : 0
                return (
                  <div
                    key={segment.id}
                    className={`timeline-segment ${segment.isActive ? 'is-active' : ''}`}
                    style={{
                      width: `${Math.max(width, 6)}%`,
                      backgroundColor: STATE_TINTS[segment.state],
                    }}
                    title={`${STATE_LABELS[segment.state]} • ${formatDuration(segment.durationMs)}`}
                  />
                )
              })}
            </div>

            <div className="segment-list">
              {currentSession.segments.slice(-6).reverse().map((segment) => (
                <article key={segment.id} className="segment-row">
                  <div>
                    <strong>
                      {STATE_LABELS[segment.state]}
                      {segment.source === 'MANUAL' ? ' · manual' : ''}
                    </strong>
                    <p>{segment.reason}</p>
                    {segment.manualNote ? (
                      <p className="helper-copy">{segment.manualNote}</p>
                    ) : null}
                  </div>
                  <div className="segment-row__meta">
                    <span>{formatDuration(segment.durationMs)}</span>
                    <span>{formatLocalDateTime(segment.startedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            The live timeline fills in once a session is running and state
            transitions have been detected.
          </div>
        )}

        <div className="daily-strip">
          {recentDays.map((summary) => (
            <article key={summary.date} className="daily-strip__item">
              <span>{formatDayLabel(summary.date)}</span>
              <strong>{formatDuration(summary.trackedMs)}</strong>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
