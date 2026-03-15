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
  PersistedSegmentInput,
  SessionCompletionInput,
  SessionRecord,
  StateTotals,
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
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
      },
    }
  } catch {
    return createStore()
  }
}

function writeStore(store: BrowserStore) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function normalizeStore(store: BrowserStore) {
  const completedSessions = store.sessions.filter(
    (session) => session.status === 'COMPLETED',
  )
  const allowedSessionIds = new Set(completedSessions.map((session) => session.id))

  store.sessions = completedSessions
  store.segments = store.segments.filter((segment) =>
    allowedSessionIds.has(segment.sessionId),
  )
}

function mergeTotals(target: StateTotals, next: StateTotals) {
  target.ON_SCREEN += next.ON_SCREEN
  target.WRITING += next.WRITING
  target.AWAY += next.AWAY
  target.UNCERTAIN += next.UNCERTAIN
}

function rebuildDailySummaries(store: BrowserStore) {
  const buckets = new Map<string, StateTotals>()

  for (const session of store.sessions) {
    if (session.status !== 'COMPLETED') {
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
    (session) => Date.parse(session.startedAt) >= cutoff,
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
      store.settings = settings
      pruneStore(store)
      rebuildDailySummaries(store)
      writeStore(store)
      return toBootstrap(store)
    },
  }
}
