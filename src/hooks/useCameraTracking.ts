import { useEffect, useRef, useState, type RefObject } from 'react'
import { FaceTracker } from '@/services/camera/faceTracker'
import { DEFAULT_WEBCAM_SIGNALS } from '@/services/inference/config'
import type { WebcamSignals } from '@/types/app'

interface UseCameraTrackingOptions {
  enabled: boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

export function useCameraTracking({
  enabled,
  videoRef,
}: UseCameraTrackingOptions) {
  const [signals, setSignals] = useState<WebcamSignals>(DEFAULT_WEBCAM_SIGNALS)
  const [error, setError] = useState<string | null>(null)
  const trackerRef = useRef<FaceTracker | null>(null)

  useEffect(() => {
    trackerRef.current = new FaceTracker()
    const tracker = trackerRef.current
    const unsubscribeSignals = tracker.subscribe(setSignals)
    const unsubscribeErrors = tracker.subscribeToErrors(setError)

    return () => {
      unsubscribeSignals()
      unsubscribeErrors()
      tracker.dispose()
      trackerRef.current = null
    }
  }, [])

  useEffect(() => {
    const tracker = trackerRef.current
    const videoElement = videoRef.current

    if (!tracker || !videoElement) {
      return
    }

    if (enabled) {
      void tracker.start(videoElement)
      return
    }

    tracker.pause()
  }, [enabled, videoRef])

  return {
    signals,
    error,
  }
}
