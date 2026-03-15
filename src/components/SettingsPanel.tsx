import type { AppSettings } from '@/types/app'
import { SectionCard } from './SectionCard'

interface SettingsPanelProps {
  settings: AppSettings
  onSettingChange: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) => void
}

export function SettingsPanel({
  settings,
  onSettingChange,
}: SettingsPanelProps) {
  return (
    <div className="wide-row">
      <SectionCard
        className="settings-card"
        title="Settings"
        subtitle="Tune thresholds, retention, and webcam preview behavior."
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
            <span>Writing posture sensitivity</span>
            <input
              max={90}
              min={20}
              onChange={(event) =>
                onSettingChange('writingSensitivity', Number(event.target.value))
              }
              step={1}
              type="range"
              value={settings.writingSensitivity}
            />
            <strong>{settings.writingSensitivity}%</strong>
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
            <span>Writing sustain window</span>
            <input
              max={6000}
              min={1000}
              onChange={(event) =>
                onSettingChange('writingSustainMs', Number(event.target.value))
              }
              step={200}
              type="range"
              value={settings.writingSustainMs}
            />
            <strong>{Math.round(settings.writingSustainMs / 1000)} sec</strong>
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
    </div>
  )
}
