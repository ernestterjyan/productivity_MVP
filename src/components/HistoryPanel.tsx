import { formatDurationLong, formatLocalDateTime } from '@/lib/time'
import type { ExportFormat, SessionRecord } from '@/types/app'
import { SectionCard } from './SectionCard'

function describeSessionMix(session: SessionRecord) {
  if (session.totals.DESK_WORK > session.totals.ON_SCREEN) {
    return 'Desk-work heavy'
  }

  if (session.totals.ON_SCREEN > session.totals.DESK_WORK) {
    return 'Screen-heavy'
  }

  return 'Mixed study block'
}

export function HistoryPanel({
  recentSessions,
  exportBusy,
  onExport,
}: {
  recentSessions: SessionRecord[]
  exportBusy: boolean
  onExport: (format: ExportFormat) => void
}) {
  const bestOnScreenSession = [...recentSessions].sort(
    (left, right) => right.totals.ON_SCREEN - left.totals.ON_SCREEN,
  )[0]
  const bestDeskWorkSession = [...recentSessions].sort(
    (left, right) => right.totals.DESK_WORK - left.totals.DESK_WORK,
  )[0]

  return (
    <div className="wide-row history-stack">
      <SectionCard
        className="history-card"
        title="Review and export"
        subtitle="Recent completed sessions stored locally on this device."
        actions={
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={exportBusy}
              onClick={() => onExport('JSON')}
            >
              Export JSON
            </button>
            <button
              className="ghost-button"
              disabled={exportBusy}
              onClick={() => onExport('SESSIONS_CSV')}
            >
              Sessions CSV
            </button>
            <button
              className="ghost-button"
              disabled={exportBusy}
              onClick={() => onExport('SEGMENTS_CSV')}
            >
              Segments CSV
            </button>
            <button
              className="ghost-button"
              disabled={exportBusy}
              onClick={() => onExport('DAILY_CSV')}
            >
              Daily CSV
            </button>
          </div>
        }
      >
        <div className="metric-grid">
          <article className="metric-tile">
            <span>Best on-screen session</span>
            <strong>
              {bestOnScreenSession
                ? formatDurationLong(bestOnScreenSession.totals.ON_SCREEN)
                : 'No data'}
            </strong>
          </article>
          <article className="metric-tile">
            <span>Most desk-work time</span>
            <strong>
              {bestDeskWorkSession
                ? formatDurationLong(bestDeskWorkSession.totals.DESK_WORK)
                : 'No data'}
            </strong>
          </article>
        </div>

        {recentSessions.length > 0 ? (
          <div className="history-list">
            {recentSessions.map((session) => (
              <article key={session.id} className="history-row">
                <div>
                  <strong>{formatLocalDateTime(session.startedAt)}</strong>
                  <p>{formatLocalDateTime(session.endedAt)}</p>
                  <p className="helper-copy">{describeSessionMix(session)}</p>
                </div>
                <div className="history-row__stats">
                  <span>Total {formatDurationLong(session.elapsedMs)}</span>
                  <span>On-screen {formatDurationLong(session.totals.ON_SCREEN)}</span>
                  <span>Desk work {formatDurationLong(session.totals.DESK_WORK)}</span>
                  <span>Away {formatDurationLong(session.totals.AWAY)}</span>
                  <span>Uncertain {formatDurationLong(session.totals.UNCERTAIN)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No completed sessions yet. Finish a session to see local review data here.
          </div>
        )}
      </SectionCard>
    </div>
  )
}
