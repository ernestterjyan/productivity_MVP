import { formatLocalDateTime } from '@/lib/time'
import type { AppSettings, SessionStatus } from '@/types/app'
import { SectionCard } from './SectionCard'

interface SettingsPanelProps {
  settings: AppSettings
  sessionStatus: SessionStatus
  calibrationOpen: boolean
  onSettingChange: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) => void
  onOpenCalibration: () => void
  onClearCalibration: () => void
}

export function SettingsPanel({
  settings,
  sessionStatus,
  calibrationOpen,
  onSettingChange,
  onOpenCalibration,
  onClearCalibration,
}: SettingsPanelProps) {
  const calibration = settings.calibrationProfile

  return (
    <div className="wide-row settings-stack">
      <SectionCard
        className="settings-card"
        title="Settings"
        subtitle="Tune thresholds, retention, camera behavior, and the optional calibration profile."
      >
        <div className="settings-grid">
          <label className="field-toggle">
            <span>Webcam preview visible</span>
            <input
              checked={settings.webcamPreviewEnabled}
              onChange={(event) =>
                onSettingChange('webcamPreviewEnabled', event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="field-toggle">
            <span>Show debug signals</span>
            <input
              checked={settings.debugModeEnabled}
              onChange={(event) =>
                onSettingChange('debugModeEnabled', event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="field-toggle">
            <span>Start tracking on app open</span>
            <input
              checked={settings.startTrackingOnOpen}
              onChange={(event) =>
                onSettingChange('startTrackingOnOpen', event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="field-toggle">
            <span>Enable retention pruning</span>
            <input
              checked={settings.retentionEnabled}
              onChange={(event) =>
                onSettingChange('retentionEnabled', event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="field-control">
            <span>Away timeout</span>
            <input
              max={15000}
              min={3000}
              onChange={(event) =>
                onSettingChange('awayTimeoutMs', Number(event.target.value))
              }
              step={500}
              type="range"
              value={settings.awayTimeoutMs}
            />
            <strong>{Math.round(settings.awayTimeoutMs / 1000)} sec</strong>
          </label>

          <label className="field-control">
            <span>Desk-work posture sensitivity</span>
            <input
              max={90}
              min={20}
              onChange={(event) =>
                onSettingChange('deskWorkSensitivity', Number(event.target.value))
              }
              step={1}
              type="range"
              value={settings.deskWorkSensitivity}
            />
            <strong>{settings.deskWorkSensitivity}%</strong>
          </label>

          <label className="field-control">
            <span>Screen-facing threshold</span>
            <input
              max={0.9}
              min={0.35}
              onChange={(event) =>
                onSettingChange('screenFacingThreshold', Number(event.target.value))
              }
              step={0.01}
              type="range"
              value={settings.screenFacingThreshold}
            />
            <strong>{settings.screenFacingThreshold.toFixed(2)}</strong>
          </label>

          <label className="field-control">
            <span>Away orientation threshold</span>
            <input
              max={0.5}
              min={0.1}
              onChange={(event) =>
                onSettingChange('faceAwayThreshold', Number(event.target.value))
              }
              step={0.01}
              type="range"
              value={settings.faceAwayThreshold}
            />
            <strong>{settings.faceAwayThreshold.toFixed(2)}</strong>
          </label>

          <label className="field-control">
            <span>Desk-work sustain window</span>
            <input
              max={6000}
              min={1000}
              onChange={(event) =>
                onSettingChange('deskWorkSustainMs', Number(event.target.value))
              }
              step={200}
              type="range"
              value={settings.deskWorkSustainMs}
            />
            <strong>{Math.round(settings.deskWorkSustainMs / 1000)} sec</strong>
          </label>

          <label className="field-control">
            <span>Transition cooldown</span>
            <input
              max={4000}
              min={600}
              onChange={(event) =>
                onSettingChange('transitionCooldownMs', Number(event.target.value))
              }
              step={100}
              type="range"
              value={settings.transitionCooldownMs}
            />
            <strong>{Math.round(settings.transitionCooldownMs / 1000)} sec</strong>
          </label>

          <label className="field-control">
            <span>Retention days</span>
            <input
              max={90}
              min={7}
              onChange={(event) =>
                onSettingChange('retentionDays', Number(event.target.value))
              }
              step={1}
              type="range"
              value={settings.retentionDays}
            />
            <strong>{settings.retentionDays} days</strong>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        className="settings-card"
        title="Calibration"
        subtitle="Optional per-user threshold tuning for screen-facing, desk-work posture, and away timing."
        actions={
          <div className="button-row">
            <button
              className="primary-button"
              disabled={sessionStatus === 'RUNNING' || calibrationOpen}
              onClick={onOpenCalibration}
            >
              {calibration ? 'Recalibrate' : 'Run calibration'}
            </button>
            {calibration ? (
              <button className="ghost-button" onClick={onClearCalibration}>
                Clear calibration
              </button>
            ) : null}
          </div>
        }
      >
        {calibration ? (
          <div className="signal-grid compact">
            <div className="signal-item">
              <span>Last calibrated</span>
              <strong>{formatLocalDateTime(calibration.calibratedAt)}</strong>
            </div>
            <div className="signal-item">
              <span>Screen baseline</span>
              <strong>{calibration.screenFacingBaseline.toFixed(2)}</strong>
            </div>
            <div className="signal-item">
              <span>Desk-work head-down</span>
              <strong>{calibration.deskWorkHeadDownBaseline.toFixed(2)}</strong>
            </div>
            <div className="signal-item">
              <span>Away loss delay</span>
              <strong>{Math.round(calibration.awayLossDelayMs / 1000)} sec</strong>
            </div>
          </div>
        ) : (
          <div className="empty-state compact-empty">
            No calibration profile yet. The app will use generic defaults until
            you run the optional flow.
          </div>
        )}

        <p className="helper-copy">
          Calibration improves threshold fit for your setup, but it does not turn webcam posture heuristics into a direct measure of concentration.
        </p>

        {sessionStatus === 'RUNNING' ? (
          <p className="helper-copy">
            Pause or stop the current session before recalibrating so the sample poses do not pollute live tracking.
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}
