export type AttentionState = 'ON_SCREEN' | 'DESK_WORK' | 'AWAY' | 'UNCERTAIN'

export type SessionStatus = 'IDLE' | 'RUNNING' | 'PAUSED'

export type SessionRecordStatus = 'ACTIVE' | 'COMPLETED'

export type CameraStatus = 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE'

export type ViewKey = 'OVERVIEW' | 'HISTORY' | 'SETTINGS'

export type SegmentSource = 'INFERENCE' | 'MANUAL'

export type ExportFormat = 'JSON' | 'SESSIONS_CSV' | 'SEGMENTS_CSV' | 'DAILY_CSV'

export type CalibrationStepKey =
  | 'SCREEN_BASELINE'
  | 'DESK_WORK_POSTURE'
  | 'AWAY_BASELINE'

export interface StateTotals {
  ON_SCREEN: number
  DESK_WORK: number
  AWAY: number
  UNCERTAIN: number
}

export interface CalibrationProfile {
  calibratedAt: string
  screenFacingBaseline: number
  recommendedScreenFacingThreshold: number
  deskWorkHeadDownBaseline: number
  recommendedHeadDownThreshold: number
  deskWorkScreenFacingUpperBound: number
  awayLossDelayMs: number
  recommendedAwayTimeoutMs: number
  screenSampleCount: number
  deskWorkSampleCount: number
  awaySampleCount: number
}

export interface AppSettings {
  webcamPreviewEnabled: boolean
  debugModeEnabled: boolean
  awayTimeoutMs: number
  screenFacingThreshold: number
  faceAwayThreshold: number
  deskWorkSensitivity: number
  deskWorkSustainMs: number
  transitionCooldownMs: number
  retentionEnabled: boolean
  retentionDays: number
  startTrackingOnOpen: boolean
  calibrationProfile: CalibrationProfile | null
}

export interface InferenceThresholds {
  awayTimeoutMs: number
  screenFacingThreshold: number
  faceAwayThreshold: number
  headDownThreshold: number
  deskWorkScreenFacingUpperBound: number
  deskWorkSustainMs: number
  transitionCooldownMs: number
  recentInteractionMs: number
  activityWindowMs: number
  awayInputGraceMs: number
  minimumHoldMs: Record<AttentionState, number>
}

export interface InferenceConfig extends InferenceThresholds {
  calibrationActive: boolean
}

export interface WebcamSignals {
  cameraStatus: CameraStatus
  faceDetected: boolean
  faceCount: number
  screenFacingScore: number
  headDownScore: number
  yawBias: number
  pitchBias: number
  noFaceDurationMs: number
  lastUpdatedAt: string | null
  lastFaceSeenAt: string | null
}

export interface ActivitySignals {
  active: boolean
  recentInteraction: boolean
  recentKeyboard: boolean
  recentPointer: boolean
  lastInteractionAt: string | null
  lastKeyboardAt: string | null
  lastPointerAt: string | null
  keyboardEventsPerMinute: number
  pointerEventsPerMinute: number
}

export interface InferenceFlags {
  strongScreenFacing: boolean
  clearlyTurnedAway: boolean
  awayCandidate: boolean
  deskWorkCandidate: boolean
  onScreenCandidate: boolean
}

export interface InferenceDebug {
  stableState: AttentionState
  candidateState: AttentionState
  pendingState: AttentionState | null
  pendingDurationMs: number
  requiredHoldMs: number
  remainingHoldMs: number
  cooldownRemainingMs: number
  transitionBlockedByCooldown: boolean
  calibrationActive: boolean
  thresholds: InferenceThresholds
  flags: InferenceFlags
  manualOverrideState: AttentionState | null
}

export interface InferenceSnapshot {
  state: AttentionState
  candidateState: AttentionState
  confidence: number
  reason: string
  transitionReason: string
  source: SegmentSource
  updatedAt: string
  webcam: WebcamSignals
  activity: ActivitySignals
  debug: InferenceDebug
}

export interface TimelineSegment {
  id: string
  sessionId: string
  state: AttentionState
  startedAt: string
  endedAt: string | null
  durationMs: number
  confidence: number
  reason: string
  source: SegmentSource
  manualNote: string | null
  isActive?: boolean
}

export interface SessionRecord {
  id: string
  startedAt: string
  endedAt: string | null
  elapsedMs: number
  totals: StateTotals
  status: SessionRecordStatus
}

export interface LiveSession {
  id: string
  startedAt: string
  endedAt: string | null
  elapsedMs: number
  totals: StateTotals
  status: SessionStatus
  segments: TimelineSegment[]
}

export interface DailySummary {
  date: string
  trackedMs: number
  totals: StateTotals
}

export interface BootstrapPayload {
  settings: AppSettings
  todaySummary: DailySummary
  dailyHistory: DailySummary[]
  recentSessions: SessionRecord[]
  recoverableSession: RecoverableSession | null
}

export interface SessionSeed {
  id: string
  startedAt: string
}

export interface PersistedSegmentInput {
  id: string
  sessionId: string
  state: AttentionState
  startedAt: string
  endedAt: string
  durationMs: number
  confidence: number
  reason: string
  source: SegmentSource
  manualNote: string | null
}

export interface SessionCompletionInput {
  sessionId: string
  endedAt: string
  elapsedMs: number
  totals: StateTotals
}

export interface SessionCorrectionInput {
  sessionId: string
  state: AttentionState
  note: string
}

export interface RecoverableSession {
  session: SessionSeed
  segments: PersistedSegmentInput[]
}

export interface ExportBundle {
  exportedAt: string
  settings: AppSettings
  sessions: SessionRecord[]
  stateSegments: PersistedSegmentInput[]
  dailySummaries: DailySummary[]
}

export interface ManualOverrideState {
  state: AttentionState
  appliedAt: string
  note: string
}
