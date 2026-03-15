import { formatDurationLong, formatLocalDateTime } from '@/lib/time'
import type { SessionRecord } from '@/types/app'
import { SectionCard } from './SectionCard'

export function HistoryPanel({
  recentSessions,
}: {
  recentSessions: SessionRecord[]
}) {
  return (
    <div className="wide-row">
      <SectionCard
        className="history-card"
        title="History"
        subtitle="Recent completed sessions stored locally on this device."
      >
        {recentSessions.length > 0 ? (
          <div className="history-list">
            {recentSessions.map((session) => (
              <article key={session.id} className="history-row">
                <div>
                  <strong>{formatLocalDateTime(session.startedAt)}</strong>
                  <p>{formatLocalDateTime(session.endedAt)}</p>
                </div>
                <div className="history-row__stats">
                  <span>Total {formatDurationLong(session.elapsedMs)}</span>
                  <span>On-screen {formatDurationLong(session.totals.ON_SCREEN)}</span>
                  <span>Writing {formatDurationLong(session.totals.WRITING)}</span>
                  <span>Away {formatDurationLong(session.totals.AWAY)}</span>
                  <span>Uncertain {formatDurationLong(session.totals.UNCERTAIN)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No completed sessions yet. Finish a session to see its totals here.
          </div>
        )}
      </SectionCard>
    </div>
  )
}
