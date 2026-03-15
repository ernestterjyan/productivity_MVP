import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  addToTotals,
  cloneTotals,
  createEmptyTotals,
  totalTrackedMs,
} from '@/lib/attention'
import { getStorageClient } from '@/services/storage/client'
import { DEFAULT_BOOTSTRAP, DEFAULT_SETTINGS } from '@/services/inference/config'
import type {
  AttentionState,
  DailySummary,
  InferenceSnapshot,
  LiveSession,
  PersistedSegmentInput,
  SessionRecord,
  SessionStatus,
  TimelineSegment,
  ViewKey,
} from '@/types/app'
import { useActivitySignals } from './useActivitySignals'
import { useAttentionInference } from './useAttentionInference'
import { useCameraTracking } from './useCameraTracking'

interface SessionRuntime {
  id: string
  startedAt: string
  totals: ReturnType<typeof createEmptyTotals>
  closedSegments: PersistedSegmentInput[]
  activeSegmentState: AttentionState | null
  activeSegmentStartMs: number | null
  activeSegmentConfidence: number
  activeSegmentReason: string
  lastAccountedAtMs: number | null
}

function makeLiveSession(
  runtime: SessionRuntime,
  status: SessionStatus,
  nowMs: number,
): LiveSession {
  const totals = cloneTotals(runtime.totals)
  const segments: TimelineSegment[] = runtime.closedSegments.map((segment) => ({
    ...segment,
  }))

  if (
    status === 'RUNNING' &&
    runtime.activeSegmentState &&
    runtime.activeSegmentStartMs !== null &&
    runtime.lastAccountedAtMs !== null
  ) {
    addToTotals(totals, runtime.activeSegmentState, nowMs - runtime.lastAccountedAtMs)
    segments.push({
      id: `live-${runtime.id}`,
      sessionId: runtime.id,
      state: runtime.activeSegmentState,
      startedAt: new Date(runtime.activeSegmentStartMs).toISOString(),
      endedAt: null,
      durationMs: Math.max(0, nowMs - runtime.activeSegmentStartMs),
      confidence: runtime.activeSegmentConfidence,
      reason: runtime.activeSegmentReason,
      isActive: true,
    })
  }

  return {
    id: runtime.id,
    startedAt: runtime.startedAt,
    endedAt: null,
    elapsedMs: totalTrackedMs(totals),
    totals,
    status,
    segments,
  }
}

export function useProductivityTracker() {
  const storageRef = useRef(getStorageClient())
  const [view, setView] = useState<ViewKey>('OVERVIEW')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [todaySummary, setTodaySummary] = useState<DailySummary>(
    DEFAULT_BOOTSTRAP.todaySummary,
  )
  const [dailyHistory, setDailyHistory] = useState<DailySummary[]>(
    DEFAULT_BOOTSTRAP.dailyHistory,
  )
  const [recentSessions, setRecentSessions] = useState<SessionRecord[]>(
    DEFAULT_BOOTSTRAP.recentSessions,
  )
  const [currentSession, setCurrentSession] = useState<LiveSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('IDLE')
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const runtimeRef = useRef<SessionRuntime | null>(null)
  const persistedSettingsRef = useRef(JSON.stringify(DEFAULT_SETTINGS))
  const autoStartRef = useRef(false)
  const clearError = useCallback(() => setErrorMessage(null), [])

  const activity = useActivitySignals(sessionStatus === 'RUNNING', settings)
  const { signals: webcam, error: cameraError } = useCameraTracking({
    enabled: sessionStatus === 'RUNNING',
    videoRef,
  })
  const inference = useAttentionInference({
    enabled: sessionStatus === 'RUNNING',
    webcam,
    activity,
    settings,
  })

  const syncHistory = useCallback((payload: {
    todaySummary: DailySummary
    dailyHistory: DailySummary[]
    recentSessions: SessionRecord[]
  }) => {
    startTransition(() => {
      setTodaySummary(payload.todaySummary)
      setDailyHistory(payload.dailyHistory)
      setRecentSessions(payload.recentSessions)
    })
  }, [])

  const syncLiveSession = useCallback((status: SessionStatus) => {
    const runtime = runtimeRef.current

    if (!runtime) {
      setCurrentSession(null)
      return
    }

    setCurrentSession(makeLiveSession(runtime, status, Date.now()))
  }, [])

  const persistSegment = useCallback(async (segment: PersistedSegmentInput) => {
    try {
      await storageRef.current.appendStateSegment(segment)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to persist state segment.',
      )
    }
  }, [])

  const accountUpTo = useCallback((nowMs: number) => {
    const runtime = runtimeRef.current

    if (
      !runtime ||
      runtime.activeSegmentState === null ||
      runtime.lastAccountedAtMs === null
    ) {
      return
    }

    const delta = Math.max(0, nowMs - runtime.lastAccountedAtMs)

    if (delta > 0) {
      addToTotals(runtime.totals, runtime.activeSegmentState, delta)
      runtime.lastAccountedAtMs = nowMs
    }
  }, [])

  const closeActiveSegment = useCallback((endMs: number) => {
    const runtime = runtimeRef.current

    if (
      !runtime ||
      runtime.activeSegmentState === null ||
      runtime.activeSegmentStartMs === null
    ) {
      return
    }

    accountUpTo(endMs)
    const durationMs = Math.max(0, endMs - runtime.activeSegmentStartMs)

    if (durationMs > 0) {
      const segment: PersistedSegmentInput = {
        id: crypto.randomUUID(),
        sessionId: runtime.id,
        state: runtime.activeSegmentState,
        startedAt: new Date(runtime.activeSegmentStartMs).toISOString(),
        endedAt: new Date(endMs).toISOString(),
        durationMs,
        confidence: runtime.activeSegmentConfidence,
        reason: runtime.activeSegmentReason,
      }

      runtime.closedSegments.push(segment)
      void persistSegment(segment)
    }

    runtime.activeSegmentState = null
    runtime.activeSegmentStartMs = null
    runtime.lastAccountedAtMs = null
  }, [accountUpTo, persistSegment])

  const openActiveSegment = useCallback(
    (snapshot: InferenceSnapshot, nowMs: number) => {
      const runtime = runtimeRef.current

      if (!runtime) {
        return
      }

      runtime.activeSegmentState = snapshot.state
      runtime.activeSegmentStartMs = nowMs
      runtime.activeSegmentConfidence = snapshot.confidence
      runtime.activeSegmentReason = snapshot.reason
      runtime.lastAccountedAtMs = nowMs
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const payload = await storageRef.current.bootstrap()

        if (cancelled) {
          return
        }

        persistedSettingsRef.current = JSON.stringify(payload.settings)
        startTransition(() => {
          setSettings(payload.settings)
          setTodaySummary(payload.todaySummary)
          setDailyHistory(payload.dailyHistory)
          setRecentSessions(payload.recentSessions)
        })
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to load saved tracker data.',
          )
        }
      } finally {
        if (!cancelled) {
          setHydrated(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (cameraError) {
      setErrorMessage(cameraError)
    }
  }, [cameraError])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    const signature = JSON.stringify(settings)

    if (signature === persistedSettingsRef.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = await storageRef.current.saveSettings(settings)
          persistedSettingsRef.current = signature
          syncHistory(payload)
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to save settings.',
          )
        }
      })()
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [hydrated, settings, syncHistory])

  const handleStartSession = useCallback(async () => {
    if (busy || sessionStatus === 'RUNNING') {
      return
    }

    setBusy(true)
    setErrorMessage(null)

    try {
      const startedAt = new Date().toISOString()
      const session = await storageRef.current.createSession(startedAt)
      runtimeRef.current = {
        id: session.id,
        startedAt: session.startedAt,
        totals: createEmptyTotals(),
        closedSegments: [],
        activeSegmentState: null,
        activeSegmentStartMs: null,
        activeSegmentConfidence: inference.confidence,
        activeSegmentReason: inference.reason,
        lastAccountedAtMs: null,
      }

      const nowMs = Date.now()
      setSessionStatus('RUNNING')
      setCurrentSession(makeLiveSession(runtimeRef.current, 'RUNNING', nowMs))
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to start the session.',
      )
    } finally {
      setBusy(false)
    }
  }, [busy, inference, sessionStatus])

  useEffect(() => {
    if (!hydrated || autoStartRef.current || !settings.startTrackingOnOpen) {
      return
    }

    autoStartRef.current = true
    void handleStartSession()
  }, [handleStartSession, hydrated, settings.startTrackingOnOpen])

  useEffect(() => {
    if (sessionStatus !== 'RUNNING') {
      return
    }

    const intervalId = window.setInterval(() => {
      accountUpTo(Date.now())
      syncLiveSession('RUNNING')
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [accountUpTo, sessionStatus, syncLiveSession])

  useEffect(() => {
    const runtime = runtimeRef.current

    if (sessionStatus !== 'RUNNING' || !runtime) {
      return
    }

    const changeAt = Date.parse(inference.updatedAt)

    if (runtime.activeSegmentState === null) {
      if (webcam.cameraStatus === 'PAUSED') {
        return
      }

      openActiveSegment(inference, changeAt)
      syncLiveSession('RUNNING')
      return
    }

    if (runtime.activeSegmentState === inference.state) {
      runtime.activeSegmentConfidence = inference.confidence
      runtime.activeSegmentReason = inference.reason
      return
    }

    closeActiveSegment(changeAt)
    openActiveSegment(inference, changeAt)
    syncLiveSession('RUNNING')
  }, [
    closeActiveSegment,
    inference,
    openActiveSegment,
    sessionStatus,
    syncLiveSession,
    webcam.cameraStatus,
  ])

  const handlePauseSession = useCallback(() => {
    if (sessionStatus !== 'RUNNING') {
      return
    }

    closeActiveSegment(Date.now())
    setSessionStatus('PAUSED')
    syncLiveSession('PAUSED')
  }, [closeActiveSegment, sessionStatus, syncLiveSession])

  const handleResumeSession = useCallback(() => {
    if (sessionStatus !== 'PAUSED' || !runtimeRef.current) {
      return
    }

    setSessionStatus('RUNNING')
    syncLiveSession('RUNNING')
  }, [sessionStatus, syncLiveSession])

  const handleStopSession = useCallback(async () => {
    const runtime = runtimeRef.current

    if (!runtime || busy) {
      return
    }

    setBusy(true)

    try {
      if (sessionStatus === 'RUNNING') {
        closeActiveSegment(Date.now())
      }

      const payload = await storageRef.current.finishSession({
        sessionId: runtime.id,
        endedAt: new Date().toISOString(),
        elapsedMs: totalTrackedMs(runtime.totals),
        totals: runtime.totals,
      })

      runtimeRef.current = null
      setCurrentSession(null)
      setSessionStatus('IDLE')
      syncHistory(payload)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to stop the session.',
      )
    } finally {
      setBusy(false)
    }
  }, [busy, closeActiveSegment, sessionStatus, syncHistory])

  const handleResetSession = useCallback(async () => {
    const runtime = runtimeRef.current

    if (!runtime || busy) {
      return
    }

    setBusy(true)

    try {
      const payload = await storageRef.current.deleteSession(runtime.id)
      runtimeRef.current = null
      setCurrentSession(null)
      setSessionStatus('IDLE')
      syncHistory(payload)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to reset the session.',
      )
    } finally {
      setBusy(false)
    }
  }, [busy, syncHistory])

  return {
    view,
    setView,
    settings,
    setSettings,
    todaySummary,
    dailyHistory,
    recentSessions,
    currentSession,
    sessionStatus,
    busy,
    hydrated,
    errorMessage,
    clearError,
    videoRef,
    webcam,
    activity,
    inference,
    handleStartSession,
    handlePauseSession,
    handleResumeSession,
    handleStopSession,
    handleResetSession,
  }
}
