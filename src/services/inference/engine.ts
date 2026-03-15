import type {
  ActivitySignals,
  AttentionState,
  InferenceConfig,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import { clamp } from '@/lib/time'

interface CandidateState {
  state: AttentionState
  confidence: number
  reason: string
}

function evaluateCandidate(
  webcam: WebcamSignals,
  activity: ActivitySignals,
  config: InferenceConfig,
): CandidateState {
  const strongScreenFacing = webcam.screenFacingScore >= config.screenFacingThreshold
  const clearlyTurnedAway = webcam.screenFacingScore <= config.faceAwayThreshold
  const writingCandidate =
    webcam.headDownScore >= config.headDownThreshold &&
    webcam.screenFacingScore <= config.writingScreenFacingUpperBound &&
    !activity.recentPointer

  if (webcam.cameraStatus === 'UNAVAILABLE') {
    return {
      state: 'UNCERTAIN',
      confidence: 0.28,
      reason: 'Camera unavailable; only limited input heuristics are available.',
    }
  }

  if (!webcam.faceDetected) {
    if (webcam.noFaceDurationMs >= config.awayTimeoutMs) {
      return {
        state: 'AWAY',
        confidence: 0.84,
        reason: 'No face detected beyond the away timeout.',
      }
    }

    return {
      state: 'UNCERTAIN',
      confidence: activity.recentInteraction ? 0.42 : 0.3,
      reason: activity.recentInteraction
        ? 'Input resumed without a stable face signal.'
        : 'Waiting for a stable face signal.',
    }
  }

  if (writingCandidate && !strongScreenFacing) {
    const confidence =
      0.58 +
      clamp((webcam.headDownScore - config.headDownThreshold) / 0.25, 0, 0.28) +
      (activity.recentKeyboard ? 0.08 : 0)

    return {
      state: 'WRITING',
      confidence: clamp(confidence, 0, 0.96),
      reason: activity.recentKeyboard
        ? 'Head-down posture and keyboard activity suggest writing or note-taking.'
        : 'Head-down posture has persisted long enough to look like writing.',
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
    }
  }

  if (clearlyTurnedAway && !activity.recentInteraction) {
    return {
      state: 'AWAY',
      confidence:
        0.66 + clamp((config.faceAwayThreshold - webcam.screenFacingScore) / 0.2, 0, 0.2),
      reason: 'Face is visible but turned away from the screen.',
    }
  }

  if (clearlyTurnedAway && activity.recentInteraction) {
    return {
      state: 'UNCERTAIN',
      confidence: 0.38,
      reason: 'Face orientation looks away, but interaction is still recent.',
    }
  }

  return {
    state: 'UNCERTAIN',
    confidence: 0.4,
    reason: 'Signals are mixed or below the confidence thresholds.',
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
    const candidate = evaluateCandidate(webcam, activity, config)
    const pendingDuration =
      this.pendingState === candidate.state ? now - this.pendingSince : 0

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
        pendingDuration >= config.minimumHoldMs[candidate.state] &&
        now - this.lastTransitionAt >= config.transitionCooldownMs

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
        : `Holding ${candidate.state
            .toLowerCase()
            .replace('_', ' ')} for ${Math.ceil(
            Math.max(config.minimumHoldMs[candidate.state] - pendingDuration, 0) /
              1000,
          )} more sec to reduce noise.`

    return {
      state: this.stableState,
      candidateState: candidate.state,
      confidence:
        this.stableState === candidate.state
          ? candidate.confidence
          : this.stableConfidence,
      reason: transitionReason,
      updatedAt: new Date(now).toISOString(),
      webcam,
      activity,
    }
  }
}
