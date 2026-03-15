import type {
  ActivitySignals,
  AttentionState,
  InferenceFlags,
  InferenceConfig,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import { clamp } from '@/lib/time'

interface CandidateState {
  state: AttentionState
  confidence: number
  reason: string
  flags: InferenceFlags
}

function evaluateCandidate(
  webcam: WebcamSignals,
  activity: ActivitySignals,
  config: InferenceConfig,
  now: number,
): CandidateState {
  const interactionAtMs = activity.lastInteractionAt
    ? Date.parse(activity.lastInteractionAt)
    : Number.NaN
  const interactionWithinAwayGrace =
    Number.isFinite(interactionAtMs) &&
    now - interactionAtMs <= config.awayInputGraceMs
  const strongScreenFacing = webcam.screenFacingScore >= config.screenFacingThreshold
  const clearlyTurnedAway = webcam.screenFacingScore <= config.faceAwayThreshold
  const awayCandidate =
    !webcam.faceDetected &&
    webcam.noFaceDurationMs >= config.awayTimeoutMs &&
    !interactionWithinAwayGrace
  const deskWorkCandidate =
    webcam.headDownScore >= config.headDownThreshold &&
    webcam.screenFacingScore <= config.deskWorkScreenFacingUpperBound &&
    !activity.recentPointer
  const onScreenCandidate = webcam.faceDetected && strongScreenFacing
  const flags: InferenceFlags = {
    strongScreenFacing,
    clearlyTurnedAway,
    awayCandidate,
    deskWorkCandidate,
    onScreenCandidate,
  }

  if (webcam.cameraStatus === 'UNAVAILABLE') {
    return {
      state: 'UNCERTAIN',
      confidence: 0.28,
      reason: 'Camera unavailable; only limited input heuristics are available.',
      flags,
    }
  }

  if (!webcam.faceDetected) {
    if (awayCandidate) {
      return {
        state: 'AWAY',
        confidence: 0.84,
        reason: 'No face detected beyond the away timeout.',
        flags,
      }
    }

    return {
      state: 'UNCERTAIN',
      confidence: activity.recentInteraction ? 0.42 : 0.3,
      reason: interactionWithinAwayGrace
        ? 'Face signal is absent but recent input is within away grace time.'
        : activity.recentInteraction
          ? 'Input resumed without a stable face signal.'
        : 'Waiting for a stable face signal.',
      flags,
    }
  }

  if (deskWorkCandidate && !strongScreenFacing) {
    const confidence =
      0.58 +
      clamp((webcam.headDownScore - config.headDownThreshold) / 0.25, 0, 0.28) +
      (activity.recentKeyboard ? 0.08 : 0)

    return {
      state: 'DESK_WORK',
      confidence: clamp(confidence, 0, 0.96),
      reason: activity.recentKeyboard
        ? 'Head-down posture and keyboard activity suggest desk work or note-taking.'
        : 'Head-down posture has persisted long enough to look like desk work.',
      flags,
    }
  }

  if (strongScreenFacing) {
    const confidence =
      0.55 +
      clamp((webcam.screenFacingScore - config.screenFacingThreshold) / 0.25, 0, 0.26) +
      (activity.recentInteraction ? 0.08 : 0)

    return {
      state: 'ON_SCREEN',
      confidence: clamp(confidence, 0, 0.96),
      reason: activity.recentInteraction
        ? 'Face is visible, aligned with the display, and recent interaction is present.'
        : 'Face is visible and roughly aligned with the display.',
      flags,
    }
  }

  if (clearlyTurnedAway && !activity.recentInteraction) {
    return {
      state: 'AWAY',
      confidence:
        0.66 + clamp((config.faceAwayThreshold - webcam.screenFacingScore) / 0.2, 0, 0.2),
      reason: 'Face is visible but turned away from the screen.',
      flags,
    }
  }

  if (clearlyTurnedAway && activity.recentInteraction) {
    return {
      state: 'UNCERTAIN',
      confidence: 0.38,
      reason: 'Face orientation looks away, but interaction is still recent.',
      flags,
    }
  }

  return {
    state: 'UNCERTAIN',
    confidence: 0.4,
    reason: 'Signals are mixed or below the confidence thresholds.',
    flags,
  }
}

export class AttentionInferenceEngine {
  private stableState: AttentionState = 'UNCERTAIN'
  private stableConfidence = 0
  private stableReason = 'Tracking is paused.'
  private pendingState: AttentionState | null = null
  private pendingSince = 0
  private lastTransitionAt = 0

  reset(now = Date.now()) {
    this.stableState = 'UNCERTAIN'
    this.stableConfidence = 0
    this.stableReason = 'Tracking is paused.'
    this.pendingState = null
    this.pendingSince = now
    this.lastTransitionAt = now
  }

  update(
    webcam: WebcamSignals,
    activity: ActivitySignals,
    config: InferenceConfig,
    now = Date.now(),
  ): InferenceSnapshot {
    const candidate = evaluateCandidate(webcam, activity, config, now)
    const pendingDuration =
      this.pendingState === candidate.state ? now - this.pendingSince : 0
    const requiredHoldMs = config.minimumHoldMs[candidate.state]
    const cooldownRemainingMs = Math.max(
      0,
      config.transitionCooldownMs - (now - this.lastTransitionAt),
    )

    if (candidate.state === this.stableState) {
      this.pendingState = null
      this.pendingSince = now
      this.stableConfidence = candidate.confidence
      this.stableReason = candidate.reason
    } else if (this.pendingState !== candidate.state) {
      this.pendingState = candidate.state
      this.pendingSince = now
    } else {
      const canTransition =
        pendingDuration >= requiredHoldMs && cooldownRemainingMs === 0

      if (canTransition) {
        this.stableState = candidate.state
        this.stableConfidence = candidate.confidence
        this.stableReason = candidate.reason
        this.pendingState = null
        this.pendingSince = now
        this.lastTransitionAt = now
      }
    }

    const transitionReason =
      candidate.state === this.stableState
        ? this.stableReason
        : cooldownRemainingMs > 0
          ? `Candidate ${candidate.state
              .toLowerCase()
              .replace('_', ' ')} is waiting for the cooldown to end.`
          : `Holding ${candidate.state
              .toLowerCase()
              .replace('_', ' ')} for ${Math.ceil(
              Math.max(requiredHoldMs - pendingDuration, 0) / 1000,
            )} more sec to reduce noise.`

    return {
      state: this.stableState,
      candidateState: candidate.state,
      confidence:
        this.stableState === candidate.state
          ? candidate.confidence
          : this.stableConfidence,
      reason: this.stableReason,
      transitionReason,
      source: 'INFERENCE',
      updatedAt: new Date(now).toISOString(),
      webcam,
      activity,
      debug: {
        stableState: this.stableState,
        candidateState: candidate.state,
        pendingState: this.pendingState,
        pendingDurationMs: pendingDuration,
        requiredHoldMs,
        remainingHoldMs: Math.max(requiredHoldMs - pendingDuration, 0),
        cooldownRemainingMs,
        transitionBlockedByCooldown: cooldownRemainingMs > 0,
        calibrationActive: config.calibrationActive,
        thresholds: {
          awayTimeoutMs: config.awayTimeoutMs,
          screenFacingThreshold: config.screenFacingThreshold,
          faceAwayThreshold: config.faceAwayThreshold,
          headDownThreshold: config.headDownThreshold,
          deskWorkScreenFacingUpperBound: config.deskWorkScreenFacingUpperBound,
          deskWorkSustainMs: config.deskWorkSustainMs,
          transitionCooldownMs: config.transitionCooldownMs,
          recentInteractionMs: config.recentInteractionMs,
          activityWindowMs: config.activityWindowMs,
          awayInputGraceMs: config.awayInputGraceMs,
          minimumHoldMs: config.minimumHoldMs,
        },
        flags: candidate.flags,
        manualOverrideState: null,
      },
    }
  }
}
