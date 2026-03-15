import { StateBadge, CameraBadge } from '@/components/StateBadge'
import type {
  AttentionState,
  CameraStatus,
  SessionStatus,
  ViewKey,
} from '@/types/app'

interface TopBarProps {
  activeView: ViewKey
  onViewChange: (view: ViewKey) => void
  sessionStatus: SessionStatus
  currentState: AttentionState
  cameraStatus: CameraStatus
}

const VIEWS: ViewKey[] = ['OVERVIEW', 'HISTORY', 'SETTINGS']
const VIEW_LABELS: Record<ViewKey, string> = {
  OVERVIEW: 'Overview',
  HISTORY: 'History',
  SETTINGS: 'Settings',
}

export function TopBar({
  activeView,
  onViewChange,
  sessionStatus,
  currentState,
  cameraStatus,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Local-first desktop study tracker</p>
        <h1>Focus Estimate</h1>
        <p className="top-bar__copy">
          All webcam processing stays on-device. The app stores derived state
          segments, not video recordings.
        </p>
      </div>

      <div className="top-bar__meta">
        <div className="top-bar__status-row">
          <StateBadge state={currentState} />
          <CameraBadge status={cameraStatus} />
          <span className="session-chip">Session {sessionStatus.toLowerCase()}</span>
        </div>

        <nav className="tab-strip" aria-label="Primary views">
          {VIEWS.map((view) => (
            <button
              key={view}
              className={`tab-button ${activeView === view ? 'is-active' : ''}`}
              onClick={() => onViewChange(view)}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
