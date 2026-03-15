import type {
  ActivitySignals,
  AppSettings,
  InferenceConfig,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import { createEmptyDailySummary } from '@/lib/attention'

export const MEDIAPIPE_WASM_PATH = '/mediapipe'
export const MEDIAPIPE_MODEL_PATH = '/models/face_landmarker.task'

export const DEFAULT_SETTINGS: AppSettings = {
  webcamPreviewEnabled: true,
  debugModeEnabled: false,
  awayTimeoutMs: 6000,
  screenFacingThreshold: 0.62,
  faceAwayThreshold: 0.3,
  writingSensitivity: 62,
  writingSustainMs: 2800,
  transitionCooldownMs: 1200,
  retentionEnabled: false,
  retentionDays: 30,
  startTrackingOnOpen: false,
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
  updatedAt: new Date().toISOString(),
  webcam: DEFAULT_WEBCAM_SIGNALS,
  activity: DEFAULT_ACTIVITY_SIGNALS,
}

export const DEFAULT_BOOTSTRAP = {
  settings: DEFAULT_SETTINGS,
  todaySummary: createEmptyDailySummary(),
  dailyHistory: [createEmptyDailySummary()],
  recentSessions: [],
}

export function toInferenceConfig(settings: AppSettings): InferenceConfig {
  const sensitivityFactor = settings.writingSensitivity / 100
  const headDownThreshold = 0.78 - sensitivityFactor * 0.22

  return {
    awayTimeoutMs: settings.awayTimeoutMs,
    screenFacingThreshold: settings.screenFacingThreshold,
    faceAwayThreshold: settings.faceAwayThreshold,
    headDownThreshold,
    writingScreenFacingUpperBound: Math.min(
      0.88,
      settings.screenFacingThreshold + 0.08,
    ),
    writingSustainMs: settings.writingSustainMs,
    transitionCooldownMs: settings.transitionCooldownMs,
    recentInteractionMs: 8000,
    activityWindowMs: 60000,
    awayInputGraceMs: 2500,
    minimumHoldMs: {
      ON_SCREEN: 1200,
      WRITING: settings.writingSustainMs,
      AWAY: 1000,
      UNCERTAIN: 1400,
    },
  }
}
