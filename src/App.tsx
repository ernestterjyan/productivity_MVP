import { CalibrationPanel } from '@/components/CalibrationPanel'
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
              subtitle="Realtime study-behavior estimate, local session timing, and today’s breakdown."
            >
              <p className="helper-copy">
                Estimates are based on local signals only: face presence, rough
                head orientation, head-down posture, and recent interaction. Optional
                calibration can tune thresholds for your own setup, but it still
                remains a heuristic estimate.
              </p>
            </SectionCard>
          </div>

          <main className="dashboard-grid">
            <SessionControls
              busy={tracker.busy}
              currentSession={tracker.currentSession}
              sessionStatus={tracker.sessionStatus}
              onPause={() => void tracker.handlePauseSession()}
              onReset={() => void tracker.handleResetSession()}
              onResume={tracker.handleResumeSession}
              onStart={() => void tracker.handleStartSession()}
              onStop={() => void tracker.handleStopSession()}
            />

            <WebcamPanel
              activity={tracker.activity}
              calibrationActive={tracker.calibrationOpen}
              previewEnabled={tracker.settings.webcamPreviewEnabled}
              sessionStatus={tracker.sessionStatus}
              videoRef={tracker.videoRef}
              webcam={tracker.webcam}
            />

            <StateSummaryPanel
              activity={tracker.activity}
              inference={tracker.inference}
              manualOverride={tracker.manualOverride}
              onClearManualCorrection={() => void tracker.clearManualOverride()}
              onManualCorrection={(state) => void tracker.handleManualCorrection(state)}
              sessionStatus={tracker.sessionStatus}
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

      {showHistory ? (
        <HistoryPanel
          exportBusy={tracker.exportBusy}
          onExport={(format) => void tracker.handleExport(format)}
          recentSessions={tracker.recentSessions}
        />
      ) : null}

      {showSettings ? (
        <SettingsPanel
          calibrationOpen={tracker.calibrationOpen}
          onClearCalibration={tracker.clearCalibration}
          onOpenCalibration={tracker.openCalibration}
          onSettingChange={updateSetting}
          sessionStatus={tracker.sessionStatus}
          settings={tracker.settings}
        />
      ) : null}

      {tracker.calibrationOpen ? (
        <CalibrationPanel
          active={tracker.calibrationOpen}
          onCancel={tracker.closeCalibration}
          onComplete={tracker.saveCalibration}
          settings={tracker.settings}
          videoRef={tracker.videoRef}
          webcam={tracker.webcam}
        />
      ) : null}
    </div>
  )
}

export default App
