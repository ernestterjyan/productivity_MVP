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
          }
        })()
      : engineRef.current.update(
          webcam,
          activity,
          toInferenceConfig(settings),
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
