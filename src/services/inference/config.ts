import type {
  ActivitySignals,
  AppSettings,
  InferenceConfig,
  InferenceSnapshot,
  InferenceThresholds,
  WebcamSignals,
} from '@/types/app'
import { createEmptyDailySummary } from '@/lib/attention'
import { clamp } from '@/lib/time'

export const MEDIAPIPE_WASM_PATH = '/mediapipe'
export const MEDIAPIPE_MODEL_PATH = '/models/face_landmarker.task'

export const DEFAULT_SETTINGS: AppSettings = {
  webcamPreviewEnabled: true,
  debugModeEnabled: false,
  awayTimeoutMs: 6000,
  screenFacingThreshold: 0.62,
  faceAwayThreshold: 0.3,
  deskWorkSensitivity: 62,
  deskWorkSustainMs: 2800,
  transitionCooldownMs: 1200,
  retentionEnabled: false,
  retentionDays: 30,
  startTrackingOnOpen: false,
  calibrationProfile: null,
}

export const DEFAULT_WEBCAM_SIGNALS: WebcamSignals = {
  cameraStatus: 'PAUSED',
  faceDetected: false,
  faceCount: 0,
  screenFacingScore: 0,
  headDownScore: 0,
  yawBias: 0,
  pitchBias: 0,
  noFaceDurationMs: 0,
  lastUpdatedAt: null,
  lastFaceSeenAt: null,
}

export const DEFAULT_ACTIVITY_SIGNALS: ActivitySignals = {
  active: false,
  recentInteraction: false,
  recentKeyboard: false,
  recentPointer: false,
  lastInteractionAt: null,
  lastKeyboardAt: null,
  lastPointerAt: null,
  keyboardEventsPerMinute: 0,
  pointerEventsPerMinute: 0,
}

export const DEFAULT_INFERENCE_SNAPSHOT: InferenceSnapshot = {
  state: 'UNCERTAIN',
  candidateState: 'UNCERTAIN',
  confidence: 0,
  reason: 'Tracking is paused.',
  transitionReason: 'Tracking is paused.',
  source: 'INFERENCE',
  updatedAt: new Date().toISOString(),
  webcam: DEFAULT_WEBCAM_SIGNALS,
  activity: DEFAULT_ACTIVITY_SIGNALS,
  debug: {
    stableState: 'UNCERTAIN',
    candidateState: 'UNCERTAIN',
    pendingState: null,
    pendingDurationMs: 0,
    requiredHoldMs: 0,
    remainingHoldMs: 0,
    cooldownRemainingMs: 0,
    transitionBlockedByCooldown: false,
    calibrationActive: false,
    thresholds: {
      awayTimeoutMs: DEFAULT_SETTINGS.awayTimeoutMs,
      screenFacingThreshold: DEFAULT_SETTINGS.screenFacingThreshold,
      faceAwayThreshold: DEFAULT_SETTINGS.faceAwayThreshold,
      headDownThreshold: 0.65,
      deskWorkScreenFacingUpperBound: 0.7,
      deskWorkSustainMs: DEFAULT_SETTINGS.deskWorkSustainMs,
      transitionCooldownMs: DEFAULT_SETTINGS.transitionCooldownMs,
      recentInteractionMs: 8000,
      activityWindowMs: 60000,
      awayInputGraceMs: 2500,
      minimumHoldMs: {
        ON_SCREEN: 1200,
        DESK_WORK: DEFAULT_SETTINGS.deskWorkSustainMs,
        AWAY: 1000,
        UNCERTAIN: 1400,
      },
    },
    flags: {
      strongScreenFacing: false,
      clearlyTurnedAway: false,
      awayCandidate: false,
      deskWorkCandidate: false,
      onScreenCandidate: false,
    },
    manualOverrideState: null,
  },
}

export const DEFAULT_BOOTSTRAP = {
  settings: DEFAULT_SETTINGS,
  todaySummary: createEmptyDailySummary(),
  dailyHistory: [createEmptyDailySummary()],
  recentSessions: [],
  recoverableSession: null,
}

function buildThresholds(settings: AppSettings): InferenceThresholds {
  const sensitivityFactor = settings.deskWorkSensitivity / 100
  const baseHeadDownThreshold = 0.78 - sensitivityFactor * 0.22
  const calibration = settings.calibrationProfile
  const screenFacingThreshold = calibration
    ? clamp(
        settings.screenFacingThreshold * 0.55 +
          calibration.recommendedScreenFacingThreshold * 0.45,
        0.35,
        0.92,
      )
    : settings.screenFacingThreshold
  const headDownThreshold = calibration
    ? clamp(
        baseHeadDownThreshold * 0.5 +
          calibration.recommendedHeadDownThreshold * 0.5,
        0.34,
        0.96,
      )
    : baseHeadDownThreshold
  const awayTimeoutMs = calibration
    ? Math.round(
        clamp(
          settings.awayTimeoutMs * 0.6 +
            calibration.recommendedAwayTimeoutMs * 0.4,
          3000,
          15000,
        ),
      )
    : settings.awayTimeoutMs

  return {
    awayTimeoutMs,
    screenFacingThreshold,
    faceAwayThreshold: settings.faceAwayThreshold,
    headDownThreshold,
    deskWorkScreenFacingUpperBound: calibration
      ? clamp(calibration.deskWorkScreenFacingUpperBound, 0.4, 0.92)
      : Math.min(0.88, screenFacingThreshold + 0.08),
    deskWorkSustainMs: settings.deskWorkSustainMs,
    transitionCooldownMs: settings.transitionCooldownMs,
    recentInteractionMs: 8000,
    activityWindowMs: 60000,
    awayInputGraceMs: 2500,
    minimumHoldMs: {
      ON_SCREEN: 1200,
      DESK_WORK: settings.deskWorkSustainMs,
      AWAY: 1000,
      UNCERTAIN: 1400,
    },
  }
}

export function toInferenceConfig(settings: AppSettings): InferenceConfig {
  return {
    ...buildThresholds(settings),
    calibrationActive: settings.calibrationProfile !== null,
  }
}
