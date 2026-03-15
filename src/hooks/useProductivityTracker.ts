import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { STATE_LABELS, totalTrackedMs } from '@/lib/attention'
import { getStorageClient } from '@/services/storage/client'
import {
  downloadExportFile,
} from '@/services/storage/exporters'
import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_SETTINGS,
} from '@/services/inference/config'
import type {
  AttentionState,
  CalibrationProfile,
  DailySummary,
  ExportFormat,
  InferenceSnapshot,
  ManualOverrideState,
  SessionRecord,
  SessionStatus,
  ViewKey,
} from '@/types/app'
import { useActivitySignals } from './useActivitySignals'
import { useAttentionInference } from './useAttentionInference'
import { useCameraTracking } from './useCameraTracking'
import {
  accountRuntimeTo,
  closeRuntimeSegment,
  createSessionRuntime,
  makeLiveSession,
  openRuntimeSegment,
  runtimeSegmentMatches,
  updateRuntimeSegmentMetadata,
  type SegmentDescriptor,
  type SessionRuntime,
} from '@/services/session/runtime'

function createDescriptor(snapshot: InferenceSnapshot): SegmentDescriptor {
  return {
    state: snapshot.state,
    confidence: snapshot.confidence,
    reason: snapshot.reason,
    source: snapshot.source,
    manualNote: snapshot.source === 'MANUAL' ? snapshot.reason : null,
  }
}

function withManualOverride(
  snapshot: InferenceSnapshot,
  manualOverride: ManualOverrideState | null,
): InferenceSnapshot {
  if (!manualOverride) {
    return {
      ...snapshot,
      debug: {
        ...snapshot.debug,
        manualOverrideState: null,
      },
    }
  }

  return {
    ...snapshot,
    state: manualOverride.state,
    confidence: 1,
    reason: manualOverride.note,
    transitionReason: 'Manual correction is active.',
    source: 'MANUAL',
    updatedAt: manualOverride.appliedAt,
    debug: {
      ...snapshot.debug,
      manualOverrideState: manualOverride.state,
    },
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
  const [currentSession, setCurrentSession] = useState<ReturnType<typeof makeLiveSession> | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('IDLE')
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [manualOverride, setManualOverride] = useState<ManualOverrideState | null>(null)
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const runtimeRef = useRef<SessionRuntime | null>(null)
  const persistedSettingsRef = useRef(JSON.stringify(DEFAULT_SETTINGS))
  const autoStartRef = useRef(false)
  const clearError = useCallback(() => setErrorMessage(null), [])

  const cameraEnabled = sessionStatus === 'RUNNING' || calibrationOpen
  const activity = useActivitySignals(sessionStatus === 'RUNNING', settings)
  const { signals: webcam, error: cameraError } = useCameraTracking({
    enabled: cameraEnabled,
    videoRef,
  })
  const baseInference = useAttentionInference({
    enabled: sessionStatus === 'RUNNING',
    webcam,
    activity,
    settings,
  })
  const inference = withManualOverride(baseInference, manualOverride)

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

  const persistClosedSegment = useCallback(async (segment: ReturnType<typeof closeRuntimeSegment>) => {
    if (!segment) {
      return
    }

    try {
      await storageRef.current.appendStateSegment(segment)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to persist state segment.',
      )
    }
  }, [])

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

  const transitionToDescriptor = useCallback(
    (descriptor: SegmentDescriptor, changeAtMs: number) => {
      const runtime = runtimeRef.current

      if (!runtime) {
        return
      }

      const closed = closeRuntimeSegment(runtime, changeAtMs)
      openRuntimeSegment(runtime, descriptor, changeAtMs)
      void persistClosedSegment(closed)
      syncLiveSession('RUNNING')
    },
    [persistClosedSegment, syncLiveSession],
  )

  const handleStartSession = useCallback(async () => {
    if (busy || sessionStatus === 'RUNNING') {
      return
    }

    setBusy(true)
    setErrorMessage(null)
    setManualOverride(null)

    try {
      const startedAt = new Date().toISOString()
      const session = await storageRef.current.createSession(startedAt)
      runtimeRef.current = createSessionRuntime(session)

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
  }, [busy, sessionStatus])

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
      const runtime = runtimeRef.current

      if (!runtime) {
        return
      }

      accountRuntimeTo(runtime, Date.now())
      syncLiveSession('RUNNING')
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [sessionStatus, syncLiveSession])

  useEffect(() => {
    const runtime = runtimeRef.current

    if (sessionStatus !== 'RUNNING' || !runtime) {
      return
    }

    const descriptor = createDescriptor(inference)
    const observedAt = Date.parse(inference.updatedAt)
    const changeAtMs = Number.isFinite(observedAt) ? observedAt : Date.now()

    if (runtime.activeSegmentState === null) {
      if (webcam.cameraStatus === 'PAUSED') {
        return
      }

      openRuntimeSegment(runtime, descriptor, changeAtMs)
      syncLiveSession('RUNNING')
      return
    }

    if (runtimeSegmentMatches(runtime, descriptor)) {
      updateRuntimeSegmentMetadata(runtime, descriptor)
      return
    }

    transitionToDescriptor(descriptor, changeAtMs)
  }, [
    inference,
    sessionStatus,
    syncLiveSession,
    transitionToDescriptor,
    webcam.cameraStatus,
  ])

  const clearManualOverride = useCallback(() => {
    if (manualOverride === null) {
      return
    }

    const runtime = runtimeRef.current
    const nextOverride = null
    setManualOverride(nextOverride)

    if (sessionStatus !== 'RUNNING' || !runtime) {
      return
    }

    const changedAtMs = Date.now()
    const descriptor = createDescriptor(withManualOverride(baseInference, nextOverride))
    transitionToDescriptor(descriptor, changedAtMs)
  }, [baseInference, manualOverride, sessionStatus, transitionToDescriptor])

  const handleManualCorrection = useCallback(
    (state: AttentionState) => {
      if (sessionStatus !== 'RUNNING' || !runtimeRef.current) {
        return
      }

      const override: ManualOverrideState = {
        state,
        appliedAt: new Date().toISOString(),
        note: `Manual correction: marked as ${STATE_LABELS[state].toLowerCase()}.`,
      }

      setManualOverride(override)
      const descriptor = createDescriptor(withManualOverride(baseInference, override))
      transitionToDescriptor(descriptor, Date.parse(override.appliedAt))
    },
    [baseInference, sessionStatus, transitionToDescriptor],
  )

  const handlePauseSession = useCallback(async () => {
    if (sessionStatus !== 'RUNNING') {
      return
    }

    const runtime = runtimeRef.current

    if (runtime) {
      const closed = closeRuntimeSegment(runtime, Date.now())
      await persistClosedSegment(closed)
    }

    setManualOverride(null)
    setSessionStatus('PAUSED')
    syncLiveSession('PAUSED')
  }, [persistClosedSegment, sessionStatus, syncLiveSession])

  const handleResumeSession = useCallback(() => {
    if (sessionStatus !== 'PAUSED' || !runtimeRef.current) {
      return
    }

    setManualOverride(null)
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
        const closed = closeRuntimeSegment(runtime, Date.now())
        await persistClosedSegment(closed)
      }

      const payload = await storageRef.current.finishSession({
        sessionId: runtime.id,
        endedAt: new Date().toISOString(),
        elapsedMs: totalTrackedMs(runtime.totals),
        totals: runtime.totals,
      })

      runtimeRef.current = null
      setManualOverride(null)
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
  }, [busy, persistClosedSegment, sessionStatus, syncHistory])

  const handleResetSession = useCallback(async () => {
    const runtime = runtimeRef.current

    if (!runtime || busy) {
      return
    }

    setBusy(true)

    try {
      const payload = await storageRef.current.deleteSession(runtime.id)
      runtimeRef.current = null
      setManualOverride(null)
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

  const openCalibration = useCallback(() => {
    if (sessionStatus === 'RUNNING') {
      setErrorMessage('Pause or stop the current session before running calibration.')
      return
    }

    setCalibrationOpen(true)
    setView('SETTINGS')
    setErrorMessage(null)
  }, [sessionStatus])

  const closeCalibration = useCallback(() => {
    setCalibrationOpen(false)
  }, [])

  const saveCalibration = useCallback((profile: CalibrationProfile) => {
    setSettings((current) => ({
      ...current,
      calibrationProfile: profile,
    }))
    setCalibrationOpen(false)
  }, [])

  const clearCalibration = useCallback(() => {
    setSettings((current) => ({
      ...current,
      calibrationProfile: null,
    }))
  }, [])

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (exportBusy) {
      return
    }

    setExportBusy(true)
    setErrorMessage(null)

    try {
      const bundle = await storageRef.current.exportData()
      downloadExportFile(format, bundle)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to export local study data.',
      )
    } finally {
      setExportBusy(false)
    }
  }, [exportBusy])

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
    exportBusy,
    hydrated,
    errorMessage,
    clearError,
    videoRef,
    webcam,
    activity,
    inference,
    baseInference,
    manualOverride,
    calibrationOpen,
    openCalibration,
    closeCalibration,
    saveCalibration,
    clearCalibration,
    handleExport,
    clearManualOverride,
    handleManualCorrection,
    handleStartSession,
    handlePauseSession,
    handleResumeSession,
    handleStopSession,
    handleResetSession,
  }
}
