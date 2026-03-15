export type AttentionState = 'ON_SCREEN' | 'WRITING' | 'AWAY' | 'UNCERTAIN'

export type SessionStatus = 'IDLE' | 'RUNNING' | 'PAUSED'

export type SessionRecordStatus = 'ACTIVE' | 'COMPLETED'

export type CameraStatus = 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE'

export type ViewKey = 'OVERVIEW' | 'HISTORY' | 'SETTINGS'

export interface StateTotals {
  ON_SCREEN: number
  WRITING: number
  AWAY: number
  UNCERTAIN: number
}

export interface AppSettings {
  webcamPreviewEnabled: boolean
  debugModeEnabled: boolean
  awayTimeoutMs: number
  screenFacingThreshold: number
  faceAwayThreshold: number
  writingSensitivity: number
  writingSustainMs: number
  transitionCooldownMs: number
  retentionEnabled: boolean
  retentionDays: number
  startTrackingOnOpen: boolean
}

export interface InferenceConfig {
  awayTimeoutMs: number
  screenFacingThreshold: number
  faceAwayThreshold: number
  headDownThreshold: number
  writingScreenFacingUpperBound: number
  writingSustainMs: number
  transitionCooldownMs: number
  recentInteractionMs: number
  activityWindowMs: number
  awayInputGraceMs: number
  minimumHoldMs: Record<AttentionState, number>
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

export interface InferenceSnapshot {
  state: AttentionState
  candidateState: AttentionState
  confidence: number
  reason: string
  updatedAt: string
  webcam: WebcamSignals
  activity: ActivitySignals
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
}

export interface SessionCompletionInput {
  sessionId: string
  endedAt: string
  elapsedMs: number
  totals: StateTotals
}
