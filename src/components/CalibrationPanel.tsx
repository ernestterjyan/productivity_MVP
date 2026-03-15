import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  captureAwayCalibrationSample,
  captureDeskWorkCalibrationSample,
  captureScreenCalibrationSample,
  createEmptyCalibrationSamples,
  deriveCalibrationProfile,
  type CalibrationSamples,
} from '@/services/inference/calibration'
import type {
  AppSettings,
  CalibrationStepKey,
  WebcamSignals,
} from '@/types/app'

const STEPS: Array<{
  key: CalibrationStepKey
  title: string
  description: string
  hint: string
}> = [
  {
    key: 'SCREEN_BASELINE',
    title: 'Screen baseline',
    description: 'Look at the screen normally.',
    hint: 'Keep your face in frame and hold your usual posture.',
  },
  {
    key: 'DESK_WORK_POSTURE',
    title: 'Desk-work posture',
    description: 'Look down as if reading or taking notes.',
    hint: 'This helps the app tune the head-down threshold for desk work.',
  },
  {
    key: 'AWAY_BASELINE',
    title: 'Away baseline',
    description: 'Look away or leave the frame.',
    hint: 'This helps estimate how long face loss takes on your setup.',
  },
]

const CAPTURE_DURATION_MS = 3000

interface CalibrationPanelProps {
  active: boolean
  settings: AppSettings
  videoRef: RefObject<HTMLVideoElement | null>
  webcam: WebcamSignals
  onCancel: () => void
  onComplete: (profile: NonNullable<AppSettings['calibrationProfile']>) => void
}

function emptyProgress() {
  return {
    screen: 0,
    deskWork: 0,
    away: 0,
  }
}

export function CalibrationPanel({
  active,
  settings,
  videoRef,
  webcam,
  onCancel,
  onComplete,
}: CalibrationPanelProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [captureStartedAtMs, setCaptureStartedAtMs] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState(
    'Calibration is optional. It adjusts thresholds for your own posture and camera framing.',
  )
  const [progress, setProgress] = useState(emptyProgress())
  const aggregateSamplesRef = useRef<CalibrationSamples>(createEmptyCalibrationSamples())
  const stepSamplesRef = useRef<CalibrationSamples>(createEmptyCalibrationSamples())
  const currentStep = STEPS[stepIndex]

  useEffect(() => {
    if (!active || captureStartedAtMs === null || !webcam.lastUpdatedAt) {
      return
    }

    const observedAtMs = Date.parse(webcam.lastUpdatedAt)

    if (!Number.isFinite(observedAtMs) || observedAtMs < captureStartedAtMs) {
      return
    }

    if (observedAtMs <= captureStartedAtMs + CAPTURE_DURATION_MS) {
      if (currentStep?.key === 'SCREEN_BASELINE') {
        captureScreenCalibrationSample(stepSamplesRef.current, webcam)
        setProgress((current) => ({
          ...current,
          screen: stepSamplesRef.current.screenFacingSamples.length,
        }))
      }

      if (currentStep?.key === 'DESK_WORK_POSTURE') {
        captureDeskWorkCalibrationSample(stepSamplesRef.current, webcam)
        setProgress((current) => ({
          ...current,
          deskWork: stepSamplesRef.current.deskWorkHeadDownSamples.length,
        }))
      }

      if (currentStep?.key === 'AWAY_BASELINE') {
        captureAwayCalibrationSample(
          stepSamplesRef.current,
          webcam,
          captureStartedAtMs,
          observedAtMs,
        )
        setProgress((current) => ({
          ...current,
          away: stepSamplesRef.current.awayLossDelaySamples.length,
        }))
      }
    }

    if (observedAtMs < captureStartedAtMs + CAPTURE_DURATION_MS) {
      return
    }

    const stepSamples = stepSamplesRef.current
    const validStep =
      (currentStep?.key === 'SCREEN_BASELINE' &&
        stepSamples.screenFacingSamples.length >= 8) ||
      (currentStep?.key === 'DESK_WORK_POSTURE' &&
        stepSamples.deskWorkHeadDownSamples.length >= 8) ||
      (currentStep?.key === 'AWAY_BASELINE' &&
        stepSamples.awayLossDelaySamples.length >= 2)

    setCaptureStartedAtMs(null)

    if (!validStep) {
      setStatusMessage(
        'That sample was too weak to use. Keep your posture clearer and retry this step.',
      )
      stepSamplesRef.current = createEmptyCalibrationSamples()
      return
    }

    aggregateSamplesRef.current.screenFacingSamples.push(
      ...stepSamples.screenFacingSamples,
    )
    aggregateSamplesRef.current.deskWorkHeadDownSamples.push(
      ...stepSamples.deskWorkHeadDownSamples,
    )
    aggregateSamplesRef.current.deskWorkScreenFacingSamples.push(
      ...stepSamples.deskWorkScreenFacingSamples,
    )
    aggregateSamplesRef.current.awayLossDelaySamples.push(
      ...stepSamples.awayLossDelaySamples,
    )
    stepSamplesRef.current = createEmptyCalibrationSamples()

    if (stepIndex === STEPS.length - 1) {
      const profile = deriveCalibrationProfile(
        aggregateSamplesRef.current,
        settings,
      )

      if (!profile) {
        setStatusMessage('Calibration could not be completed. Retry the steps with a steadier posture.')
        return
      }

      onComplete(profile)
      return
    }

    setStepIndex((current) => current + 1)
    setStatusMessage('Sample captured. Move to the next posture when you are ready.')
  }, [active, captureStartedAtMs, currentStep?.key, onComplete, settings, stepIndex, webcam])

  if (!active || !currentStep) {
    return null
  }

  return (
    <div className="overlay-shell" role="dialog" aria-modal="true">
      <div className="overlay-card calibration-card">
        <div className="overlay-card__header">
          <div>
            <p className="eyebrow">Optional calibration</p>
            <h2>{currentStep.title}</h2>
            <p className="helper-copy">
              {currentStep.description} {currentStep.hint}
            </p>
          </div>

          <button className="ghost-button" onClick={onCancel}>
            Close
          </button>
        </div>

        <div className="calibration-layout">
          <div className="webcam-stage calibration-stage">
            <video
              ref={videoRef}
              className="webcam-feed"
              autoPlay
              muted
              playsInline
            />

            <div className="webcam-overlay">
              {webcam.cameraStatus === 'UNAVAILABLE'
                ? 'Camera unavailable. Grant webcam permission and retry calibration.'
                : 'Video stays local. Samples are used only to tune thresholds on this device.'}
            </div>
          </div>

          <div className="calibration-copy">
            <div className="signal-grid compact">
              <div className="signal-item">
                <span>Step</span>
                <strong>
                  {stepIndex + 1} / {STEPS.length}
                </strong>
              </div>
              <div className="signal-item">
                <span>Face present</span>
                <strong>{webcam.faceDetected ? 'Yes' : 'No'}</strong>
              </div>
              <div className="signal-item">
                <span>Facing score</span>
                <strong>{Math.round(webcam.screenFacingScore * 100)}%</strong>
              </div>
              <div className="signal-item">
                <span>Head-down score</span>
                <strong>{Math.round(webcam.headDownScore * 100)}%</strong>
              </div>
            </div>

            <p className="reason-copy">{statusMessage}</p>

            <p className="helper-copy">
              Captured samples: screen {progress.screen}, desk work {progress.deskWork}, away {progress.away}
            </p>

            <div className="button-row">
              <button
                className="primary-button"
                disabled={webcam.cameraStatus !== 'ACTIVE' || captureStartedAtMs !== null}
                onClick={() => {
                  stepSamplesRef.current = createEmptyCalibrationSamples()
                  setCaptureStartedAtMs(Date.now())
                  setStatusMessage('Capturing a short sample. Hold the posture until the timer ends.')
                }}
              >
                {captureStartedAtMs === null
                  ? 'Capture sample'
                  : 'Capturing...'}
              </button>
              <button
                className="secondary-button"
                disabled={captureStartedAtMs !== null}
                onClick={() => {
                  stepSamplesRef.current = createEmptyCalibrationSamples()
                  setStatusMessage('Sample cleared. Retry this step when ready.')
                }}
              >
                Retry step
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
