import { useEffect, useRef, useState } from 'react'
import type {
  ActivitySignals,
  AppSettings,
  InferenceSnapshot,
  WebcamSignals,
} from '@/types/app'
import {
  DEFAULT_INFERENCE_SNAPSHOT,
  toInferenceConfig,
} from '@/services/inference/config'
import { AttentionInferenceEngine } from '@/services/inference/engine'

interface UseAttentionInferenceOptions {
  enabled: boolean
  webcam: WebcamSignals
  activity: ActivitySignals
  settings: AppSettings
}

export function useAttentionInference({
  enabled,
  webcam,
  activity,
  settings,
}: UseAttentionInferenceOptions): InferenceSnapshot {
  const [snapshot, setSnapshot] = useState(DEFAULT_INFERENCE_SNAPSHOT)
  const engineRef = useRef(new AttentionInferenceEngine())

  useEffect(() => {
    let cancelled = false
    const config = toInferenceConfig(settings)
    const observedAt =
      webcam.lastUpdatedAt ??
      activity.lastInteractionAt ??
      DEFAULT_INFERENCE_SNAPSHOT.updatedAt
    const observedMs = Date.parse(observedAt)
    const nextSnapshot = !enabled
      ? (() => {
          engineRef.current.reset(Number.isFinite(observedMs) ? observedMs : 0)
          return {
            ...DEFAULT_INFERENCE_SNAPSHOT,
            updatedAt: observedAt,
            webcam,
            activity,
            reason: 'Tracking is paused.',
            transitionReason: 'Tracking is paused.',
            debug: {
              ...DEFAULT_INFERENCE_SNAPSHOT.debug,
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
            },
          }
        })()
      : engineRef.current.update(
          webcam,
          activity,
          config,
          Number.isFinite(observedMs) ? observedMs : 0,
        )

    queueMicrotask(() => {
      if (!cancelled) {
        setSnapshot(nextSnapshot)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activity, enabled, settings, webcam])

  return snapshot
}
