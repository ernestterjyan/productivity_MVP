import {
  cloneTotals,
  createEmptyDailySummary,
  createEmptyTotals,
  totalTrackedMs,
} from '@/lib/attention'
import { toDateKey } from '@/lib/time'
import { DEFAULT_SETTINGS } from '@/services/inference/config'
import type {
  AppSettings,
  BootstrapPayload,
  DailySummary,
  ExportBundle,
  PersistedSegmentInput,
  SessionCorrectionInput,
  SessionCompletionInput,
  SessionRecord,
  StateTotals,
  AttentionState,
} from '@/types/app'
import type { SessionSeed } from '@/types/app'
import type { StorageClient } from './client'

interface BrowserStore {
  sessions: SessionRecord[]
  segments: PersistedSegmentInput[]
  dailySummaries: DailySummary[]
  settings: AppSettings
}

const STORAGE_KEY = 'focus-estimate-store-v1'

function createStore(): BrowserStore {
  return {
    sessions: [],
    segments: [],
    dailySummaries: [],
    settings: DEFAULT_SETTINGS,
  }
}

function readStore(): BrowserStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return createStore()
    }

    const parsed = JSON.parse(raw) as Partial<BrowserStore>

    return {
      sessions: parsed.sessions ?? [],
      segments: parsed.segments ?? [],
      dailySummaries: parsed.dailySummaries ?? [],
      settings: normalizeSettings(
        (parsed.settings ?? {}) as Partial<AppSettings> & Record<string, unknown>,
      ),
    }
  } catch {
    return createStore()
  }
}

function writeStore(store: BrowserStore) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function normalizeStateName(state: string): AttentionState {
  if (state === 'WRITING') {
    return 'DESK_WORK'
  }

  return state as AttentionState
}

function normalizeTotals(
  totals:
    | Partial<StateTotals>
    | Partial<Record<'WRITING' | keyof StateTotals, number>>
    | undefined,
): StateTotals {
  const legacyTotals = totals as
    | Partial<Record<'WRITING' | keyof StateTotals, number>>
    | undefined

  return {
    ON_SCREEN: Math.max(0, Number(legacyTotals?.ON_SCREEN ?? 0)),
    DESK_WORK: Math.max(
      0,
      Number(legacyTotals?.DESK_WORK ?? legacyTotals?.WRITING ?? 0),
    ),
    AWAY: Math.max(0, Number(legacyTotals?.AWAY ?? 0)),
    UNCERTAIN: Math.max(0, Number(legacyTotals?.UNCERTAIN ?? 0)),
  }
}

function normalizeSettings(
  settings:
    | (Partial<AppSettings> & Record<string, unknown>)
    | AppSettings
    | undefined = {},
) {
  const legacySettings = settings as Partial<Record<string, unknown>>

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    deskWorkSensitivity: Number(
      legacySettings.deskWorkSensitivity ??
        legacySettings.writingSensitivity ??
        DEFAULT_SETTINGS.deskWorkSensitivity,
    ),
    deskWorkSustainMs: Number(
      legacySettings.deskWorkSustainMs ??
        legacySettings.writingSustainMs ??
        DEFAULT_SETTINGS.deskWorkSustainMs,
    ),
    calibrationProfile:
      settings.calibrationProfile && typeof settings.calibrationProfile === 'object'
        ? {
            ...settings.calibrationProfile,
          }
        : null,
  }
}

function normalizeStore(store: BrowserStore) {
  const completedSessions = store.sessions.filter(
    (session) => session.status === 'COMPLETED',
  )
  const normalizedCompletedSessions = completedSessions.map((session) => ({
    ...session,
    totals: normalizeTotals(session.totals),
  }))
  const recoverableSession = [...store.sessions]
    .filter((session) => session.status === 'ACTIVE')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
  const normalizedRecoverableSession = recoverableSession
    ? {
        ...recoverableSession,
        totals: normalizeTotals(recoverableSession.totals),
      }
    : null
  const normalizedSessions = normalizedRecoverableSession
    ? [...normalizedCompletedSessions, normalizedRecoverableSession]
    : normalizedCompletedSessions
  const allowedSessionIds = new Set(normalizedSessions.map((session) => session.id))

  store.sessions = normalizedSessions
  store.segments = store.segments
    .filter((segment) => allowedSessionIds.has(segment.sessionId))
    .map((segment) => ({
      ...segment,
      state: normalizeStateName(segment.state),
      source: segment.source ?? 'INFERENCE',
      manualNote: segment.manualNote ?? null,
    }))
  store.settings = normalizeSettings(store.settings as Partial<AppSettings> & Record<string, unknown>)
}

function mergeTotals(target: StateTotals, next: StateTotals) {
  target.ON_SCREEN += next.ON_SCREEN
  target.DESK_WORK += next.DESK_WORK
  target.AWAY += next.AWAY
  target.UNCERTAIN += next.UNCERTAIN
}

function addStateDuration(
  totals: StateTotals,
  state: AttentionState,
  durationMs: number,
) {
  const safeDuration = Math.max(0, Math.round(durationMs))

  if (safeDuration <= 0) {
    return
  }

  if (state === 'ON_SCREEN') {
    totals.ON_SCREEN += safeDuration
    return
  }

  if (state === 'DESK_WORK') {
    totals.DESK_WORK += safeDuration
    return
  }

  if (state === 'AWAY') {
    totals.AWAY += safeDuration
    return
  }

  if (state === 'UNCERTAIN') {
    totals.UNCERTAIN += safeDuration
  }
}

function nextLocalDayStartMs(timestampMs: number) {
  const next = new Date(timestampMs)
  next.setHours(24, 0, 0, 0)
  return next.getTime()
}

function splitSegmentByDate(
  startedAt: string,
  endedAt: string,
  fallbackDurationMs: number,
) {
  const startedMs = Date.parse(startedAt)
  const endedMs = Date.parse(endedAt)

  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) {
    return [
      {
        date: toDateKey(startedAt),
        durationMs: Math.max(0, Math.round(fallbackDurationMs)),
      },
    ]
  }

  const slices: Array<{ date: string; durationMs: number }> = []
  let cursorMs = startedMs

  while (cursorMs < endedMs) {
    const boundaryMs = nextLocalDayStartMs(cursorMs)
    const sliceEndMs = Math.min(endedMs, boundaryMs)
    const durationMs = Math.max(0, sliceEndMs - cursorMs)

    if (durationMs > 0) {
      slices.push({
        date: toDateKey(cursorMs),
        durationMs,
      })
    }

    if (sliceEndMs <= cursorMs) {
      break
    }

    cursorMs = sliceEndMs
  }

  return slices
}

function rebuildDailySummaries(store: BrowserStore) {
  const buckets = new Map<string, StateTotals>()
  const completedSessions = store.sessions.filter(
    (session) => session.status === 'COMPLETED',
  )
  const completedSessionIds = new Set(completedSessions.map((session) => session.id))
  const sessionsWithSegments = new Set<string>()

  for (const segment of store.segments) {
    if (!completedSessionIds.has(segment.sessionId)) {
      continue
    }

    sessionsWithSegments.add(segment.sessionId)

    const slices = splitSegmentByDate(
      segment.startedAt,
      segment.endedAt,
      segment.durationMs,
    )

    for (const slice of slices) {
      const totals = buckets.get(slice.date) ?? createEmptyTotals()
      addStateDuration(totals, segment.state, slice.durationMs)
      buckets.set(slice.date, totals)
    }
  }

  // Legacy fallback for sessions that have totals but no segment rows.
  for (const session of completedSessions) {
    if (sessionsWithSegments.has(session.id)) {
      continue
    }

    const dateKey = toDateKey(session.startedAt)
    const existing = buckets.get(dateKey) ?? createEmptyTotals()
    mergeTotals(existing, session.totals)
    buckets.set(dateKey, existing)
  }

  store.dailySummaries = Array.from(buckets.entries())
    .map(([date, totals]) => ({
      date,
      totals,
      trackedMs: totalTrackedMs(totals),
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
}

function pruneStore(store: BrowserStore) {
  if (!store.settings.retentionEnabled) {
    return
  }

  const cutoff = Date.now() - store.settings.retentionDays * 24 * 60 * 60 * 1000

  store.sessions = store.sessions.filter(
    (session) =>
      session.status === 'ACTIVE' || Date.parse(session.startedAt) >= cutoff,
  )
  const allowedSessionIds = new Set(store.sessions.map((session) => session.id))
  store.segments = store.segments.filter((segment) =>
    allowedSessionIds.has(segment.sessionId),
  )
  rebuildDailySummaries(store)
}

function toBootstrap(store: BrowserStore): BootstrapPayload {
  const todayKey = toDateKey()
  const todaySummary =
    store.dailySummaries.find((summary) => summary.date === todayKey) ??
    createEmptyDailySummary(todayKey)

  const recoverable = [...store.sessions]
    .filter((session) => session.status === 'ACTIVE')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]

  return {
    settings: store.settings,
    todaySummary,
    dailyHistory:
      store.dailySummaries.length > 0
        ? store.dailySummaries
        : [createEmptyDailySummary(todayKey)],
    recentSessions: store.sessions
      .filter((session) => session.status === 'COMPLETED')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 12),
    recoverableSession: recoverable
      ? {
          session: {
            id: recoverable.id,
            startedAt: recoverable.startedAt,
          },
          segments: [...store.segments]
            .filter((segment) => segment.sessionId === recoverable.id)
            .sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
        }
      : null,
  }
}

function toExportBundle(store: BrowserStore): ExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    settings: store.settings,
    sessions: [...store.sessions].sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    ),
    stateSegments: [...store.segments].sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt),
    ),
    dailySummaries: [...store.dailySummaries].sort((left, right) =>
      right.date.localeCompare(left.date),
    ),
  }
}

export function createBrowserStorageClient(): StorageClient {
  return {
    async bootstrap() {
      const store = readStore()
      normalizeStore(store)
      pruneStore(store)
      rebuildDailySummaries(store)
      writeStore(store)
      return toBootstrap(store)
    },

    async createSession(startedAt: string): Promise<SessionSeed> {
      const store = readStore()
      const activeSessionIds = new Set(
        store.sessions
          .filter((session) => session.status === 'ACTIVE')
          .map((session) => session.id),
      )
      store.sessions = store.sessions.filter((session) => session.status !== 'ACTIVE')
      store.segments = store.segments.filter((segment) =>
        !activeSessionIds.has(segment.sessionId),
      )
      const session: SessionRecord = {
        id: crypto.randomUUID(),
        startedAt,
        endedAt: null,
        elapsedMs: 0,
        totals: createEmptyTotals(),
        status: 'ACTIVE',
      }

      store.sessions.push(session)
      writeStore(store)

      return {
        id: session.id,
        startedAt: session.startedAt,
      }
    },

    async appendStateSegment(segment: PersistedSegmentInput) {
      const store = readStore()
      const nextSegments = store.segments.filter((entry) => entry.id !== segment.id)
      nextSegments.push(segment)
      store.segments = nextSegments
      writeStore(store)
    },

    async finishSession(payload: SessionCompletionInput) {
      const store = readStore()
      store.sessions = store.sessions.map((session) =>
        session.id === payload.sessionId
          ? {
              ...session,
              endedAt: payload.endedAt,
              elapsedMs: payload.elapsedMs,
              totals: cloneTotals(payload.totals),
              status: 'COMPLETED',
            }
          : session,
      )
      rebuildDailySummaries(store)
      pruneStore(store)
      writeStore(store)
      return toBootstrap(store)
    },

    async correctSession(payload: SessionCorrectionInput) {
      const store = readStore()
      const target = store.sessions.find(
        (session) =>
          session.id === payload.sessionId && session.status === 'COMPLETED',
      )

      if (!target || !target.endedAt) {
        throw new Error('Session not found or not eligible for correction.')
      }

      const correctedTotals = createEmptyTotals()
      addStateDuration(correctedTotals, payload.state, target.elapsedMs)
      store.sessions = store.sessions.map((session) =>
        session.id === target.id
          ? {
              ...session,
              totals: cloneTotals(correctedTotals),
            }
          : session,
      )
      store.segments = store.segments.filter((segment) => segment.sessionId !== target.id)
      store.segments.push({
        id: crypto.randomUUID(),
        sessionId: target.id,
        state: payload.state,
        startedAt: target.startedAt,
        endedAt: target.endedAt,
        durationMs: target.elapsedMs,
        confidence: 1,
        reason: payload.note,
        source: 'MANUAL',
        manualNote: payload.note,
      })
      rebuildDailySummaries(store)
      pruneStore(store)
      writeStore(store)
      return toBootstrap(store)
    },

    async deleteSession(sessionId: string) {
      const store = readStore()
      store.sessions = store.sessions.filter((session) => session.id !== sessionId)
      store.segments = store.segments.filter((segment) => segment.sessionId !== sessionId)
      rebuildDailySummaries(store)
      writeStore(store)
      return toBootstrap(store)
    },

    async saveSettings(settings: AppSettings) {
      const store = readStore()
      store.settings = normalizeSettings(settings)
      pruneStore(store)
      rebuildDailySummaries(store)
      writeStore(store)
      return toBootstrap(store)
    },

    async exportData() {
      const store = readStore()
      normalizeStore(store)
      pruneStore(store)
      rebuildDailySummaries(store)
      writeStore(store)
      return toExportBundle(store)
    },
  }
}
