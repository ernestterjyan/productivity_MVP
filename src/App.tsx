import { DebugSignalsPanel } from '@/components/DebugSignalsPanel'
import { HistoryPanel } from '@/components/HistoryPanel'
import { SessionControls } from '@/components/SessionControls'
import { SectionCard } from '@/components/SectionCard'
import { SettingsPanel } from '@/components/SettingsPanel'
import { StateSummaryPanel } from '@/components/StateSummaryPanel'
import { StatsPanel } from '@/components/StatsPanel'
import { TimelinePanel } from '@/components/TimelinePanel'
import { TopBar } from '@/components/TopBar'
import { WebcamPanel } from '@/components/WebcamPanel'
import { useProductivityTracker } from '@/hooks/useProductivityTracker'
import type { AppSettings } from '@/types/app'

function App() {
  const tracker = useProductivityTracker()

  const updateSetting = <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) => {
    tracker.setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const showOverview = tracker.view === 'OVERVIEW'
  const showHistory = tracker.view === 'HISTORY'
  const showSettings = tracker.view === 'SETTINGS'

  return (
    <div className="app-shell">
      <TopBar
        activeView={tracker.view}
        onViewChange={tracker.setView}
        sessionStatus={tracker.sessionStatus}
        currentState={tracker.inference.state}
        cameraStatus={tracker.webcam.cameraStatus}
      />

      {tracker.errorMessage ? (
        <div className="alert-banner" role="alert">
          <span>{tracker.errorMessage}</span>
          <button className="ghost-button" onClick={tracker.clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {showOverview ? (
        <>
          <div className="view-intro">
            <SectionCard
              title="Overview"
              subtitle="Realtime attention estimate, local session timing, and today’s study breakdown."
            >
              <p className="helper-copy">
                Estimates are based on local signals only: face presence, rough
                head orientation, head-down posture, and recent interaction.
              </p>
            </SectionCard>
          </div>

          <main className="dashboard-grid">
            <SessionControls
              busy={tracker.busy}
              currentSession={tracker.currentSession}
              sessionStatus={tracker.sessionStatus}
              onPause={tracker.handlePauseSession}
              onReset={tracker.handleResetSession}
              onResume={tracker.handleResumeSession}
              onStart={tracker.handleStartSession}
              onStop={tracker.handleStopSession}
            />

            <WebcamPanel
              activity={tracker.activity}
              previewEnabled={tracker.settings.webcamPreviewEnabled}
              sessionStatus={tracker.sessionStatus}
              videoRef={tracker.videoRef}
              webcam={tracker.webcam}
            />

            <StateSummaryPanel
              activity={tracker.activity}
              inference={tracker.inference}
              webcam={tracker.webcam}
            />

            <StatsPanel
              currentSession={tracker.currentSession}
              dailyHistory={tracker.dailyHistory}
              todaySummary={tracker.todaySummary}
            />
          </main>

          <TimelinePanel
            currentSession={tracker.currentSession}
            dailyHistory={tracker.dailyHistory}
          />

          {tracker.settings.debugModeEnabled ? (
            <div className="debug-row">
              <DebugSignalsPanel
                activity={tracker.activity}
                inference={tracker.inference}
                webcam={tracker.webcam}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {showHistory ? <HistoryPanel recentSessions={tracker.recentSessions} /> : null}

      {showSettings ? (
        <SettingsPanel
          settings={tracker.settings}
          onSettingChange={updateSetting}
        />
      ) : null}
    </div>
  )
}

export default App
