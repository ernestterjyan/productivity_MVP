import {
  addToTotals,
  cloneTotals,
  createEmptyTotals,
  totalTrackedMs,
} from '@/lib/attention'
import type {
  AttentionState,
  PersistedSegmentInput,
  SegmentSource,
  SessionSeed,
  SessionStatus,
  TimelineSegment,
  LiveSession,
} from '@/types/app'

export interface SegmentDescriptor {
  state: AttentionState
  confidence: number
  reason: string
  source: SegmentSource
  manualNote: string | null
}

export interface SessionRuntime {
  id: string
  startedAt: string
  totals: ReturnType<typeof createEmptyTotals>
  closedSegments: PersistedSegmentInput[]
  activeSegmentState: AttentionState | null
  activeSegmentStartMs: number | null
  activeSegmentConfidence: number
  activeSegmentReason: string
  activeSegmentSource: SegmentSource
  activeSegmentManualNote: string | null
  lastAccountedAtMs: number | null
}

export function createSessionRuntime(seed: SessionSeed): SessionRuntime {
  return {
    id: seed.id,
    startedAt: seed.startedAt,
    totals: createEmptyTotals(),
    closedSegments: [],
    activeSegmentState: null,
    activeSegmentStartMs: null,
    activeSegmentConfidence: 0,
    activeSegmentReason: 'Tracking is paused.',
    activeSegmentSource: 'INFERENCE',
    activeSegmentManualNote: null,
    lastAccountedAtMs: null,
  }
}

export function hydrateSessionRuntime(
  seed: SessionSeed,
  segments: PersistedSegmentInput[],
): SessionRuntime {
  const runtime = createSessionRuntime(seed)
  const orderedSegments = [...segments].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  )

  for (const segment of orderedSegments) {
    const durationMs = Math.max(0, segment.durationMs)

    if (durationMs <= 0) {
      continue
    }

    runtime.closedSegments.push({
      ...segment,
      durationMs,
    })
    addToTotals(runtime.totals, segment.state, durationMs)
  }

  return runtime
}

export function accountRuntimeTo(runtime: SessionRuntime, nowMs: number) {
  if (
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
}

export function closeRuntimeSegment(
  runtime: SessionRuntime,
  endMs: number,
): PersistedSegmentInput | null {
  if (
    runtime.activeSegmentState === null ||
    runtime.activeSegmentStartMs === null
  ) {
    return null
  }

  accountRuntimeTo(runtime, endMs)
  const durationMs = Math.max(0, endMs - runtime.activeSegmentStartMs)

  if (durationMs <= 0) {
    runtime.activeSegmentState = null
    runtime.activeSegmentStartMs = null
    runtime.lastAccountedAtMs = null
    runtime.activeSegmentManualNote = null
    return null
  }

  const segment: PersistedSegmentInput = {
    id: crypto.randomUUID(),
    sessionId: runtime.id,
    state: runtime.activeSegmentState,
    startedAt: new Date(runtime.activeSegmentStartMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    durationMs,
    confidence: runtime.activeSegmentConfidence,
    reason: runtime.activeSegmentReason,
    source: runtime.activeSegmentSource,
    manualNote: runtime.activeSegmentManualNote,
  }

  runtime.closedSegments.push(segment)
  runtime.activeSegmentState = null
  runtime.activeSegmentStartMs = null
  runtime.lastAccountedAtMs = null
  runtime.activeSegmentManualNote = null

  return segment
}

export function openRuntimeSegment(
  runtime: SessionRuntime,
  descriptor: SegmentDescriptor,
  nowMs: number,
) {
  runtime.activeSegmentState = descriptor.state
  runtime.activeSegmentStartMs = nowMs
  runtime.activeSegmentConfidence = descriptor.confidence
  runtime.activeSegmentReason = descriptor.reason
  runtime.activeSegmentSource = descriptor.source
  runtime.activeSegmentManualNote = descriptor.manualNote
  runtime.lastAccountedAtMs = nowMs
}

export function runtimeSegmentMatches(
  runtime: SessionRuntime,
  descriptor: SegmentDescriptor,
) {
  return (
    runtime.activeSegmentState === descriptor.state &&
    runtime.activeSegmentSource === descriptor.source &&
    runtime.activeSegmentManualNote === descriptor.manualNote
  )
}

export function updateRuntimeSegmentMetadata(
  runtime: SessionRuntime,
  descriptor: SegmentDescriptor,
) {
  runtime.activeSegmentConfidence = descriptor.confidence
  runtime.activeSegmentReason = descriptor.reason
}

export function makeLiveSession(
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
      id: `live-${runtime.id}-${runtime.activeSegmentSource}`,
      sessionId: runtime.id,
      state: runtime.activeSegmentState,
      startedAt: new Date(runtime.activeSegmentStartMs).toISOString(),
      endedAt: null,
      durationMs: Math.max(0, nowMs - runtime.activeSegmentStartMs),
      confidence: runtime.activeSegmentConfidence,
      reason: runtime.activeSegmentReason,
      source: runtime.activeSegmentSource,
      manualNote: runtime.activeSegmentManualNote,
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
