import { useEffect, useRef, useState } from 'react'
import { ActivityTracker } from '@/services/activity/activityTracker'
import {
  DEFAULT_ACTIVITY_SIGNALS,
  toInferenceConfig,
} from '@/services/inference/config'
import type { ActivitySignals, AppSettings } from '@/types/app'

export function useActivitySignals(
  enabled: boolean,
  settings: AppSettings,
): ActivitySignals {
  const [signals, setSignals] = useState(DEFAULT_ACTIVITY_SIGNALS)
  const trackerRef = useRef<ActivityTracker | null>(null)

  if (trackerRef.current == null) {
    trackerRef.current = new ActivityTracker(toInferenceConfig(settings))
  }

  useEffect(() => {
    const tracker = trackerRef.current

    if (!tracker) {
      return
    }

    const unsubscribe = tracker.subscribe(setSignals)

    return () => {
      unsubscribe()
      tracker.dispose()
      trackerRef.current = null
    }
  }, [])

  useEffect(() => {
    const tracker = trackerRef.current

    if (!tracker) {
      return
    }

    const config = toInferenceConfig(settings)
    tracker.setConfig(config)

    if (enabled) {
      tracker.start()
      return
    }

    tracker.pause()
  }, [enabled, settings])

  return signals
}
