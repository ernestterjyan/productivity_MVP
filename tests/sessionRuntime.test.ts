import {
  accountRuntimeTo,
  closeRuntimeSegment,
  createSessionRuntime,
  hydrateSessionRuntime,
  makeLiveSession,
  openRuntimeSegment,
} from '@/services/session/runtime'

describe('session runtime', () => {
  it('accounts elapsed time into totals and persisted segments', () => {
    const runtime = createSessionRuntime({
      id: 'session-1',
      startedAt: new Date('2026-03-15T09:00:00.000Z').toISOString(),
    })

    openRuntimeSegment(
      runtime,
      {
        state: 'ON_SCREEN',
        confidence: 0.88,
        reason: 'Stable on-screen state.',
        source: 'INFERENCE',
        manualNote: null,
      },
      1_000,
    )
    accountRuntimeTo(runtime, 31_000)

    const closed = closeRuntimeSegment(runtime, 31_000)

    expect(runtime.totals.ON_SCREEN).toBe(30_000)
    expect(closed?.durationMs).toBe(30_000)
    expect(closed?.source).toBe('INFERENCE')
  })

  it('tracks manual correction segments separately', () => {
    const runtime = createSessionRuntime({
      id: 'session-2',
      startedAt: new Date('2026-03-15T10:00:00.000Z').toISOString(),
    })

    openRuntimeSegment(
      runtime,
      {
        state: 'ON_SCREEN',
        confidence: 0.77,
        reason: 'Stable on-screen state.',
        source: 'INFERENCE',
        manualNote: null,
      },
      5_000,
    )
    const firstClosed = closeRuntimeSegment(runtime, 15_000)

    openRuntimeSegment(
      runtime,
      {
        state: 'DESK_WORK',
        confidence: 1,
        reason: 'Manual correction: marked as desk work.',
        source: 'MANUAL',
        manualNote: 'Manual correction: marked as desk work.',
      },
      15_000,
    )
    const secondClosed = closeRuntimeSegment(runtime, 35_000)

    expect(firstClosed?.state).toBe('ON_SCREEN')
    expect(secondClosed?.state).toBe('DESK_WORK')
    expect(secondClosed?.source).toBe('MANUAL')
    expect(runtime.totals.ON_SCREEN).toBe(10_000)
    expect(runtime.totals.DESK_WORK).toBe(20_000)
  })

  it('builds a live session with the current active segment', () => {
    const runtime = createSessionRuntime({
      id: 'session-3',
      startedAt: new Date('2026-03-15T11:00:00.000Z').toISOString(),
    })

    openRuntimeSegment(
      runtime,
      {
        state: 'UNCERTAIN',
        confidence: 0.4,
        reason: 'Waiting for a stable face signal.',
        source: 'INFERENCE',
        manualNote: null,
      },
      2_000,
    )

    const live = makeLiveSession(runtime, 'RUNNING', 12_000)

    expect(live.elapsedMs).toBe(10_000)
    expect(live.segments).toHaveLength(1)
    expect(live.segments[0]?.isActive).toBe(true)
  })

  it('hydrates runtime totals from persisted segments for recovery', () => {
    const runtime = hydrateSessionRuntime(
      {
        id: 'session-4',
        startedAt: new Date('2026-03-15T12:00:00.000Z').toISOString(),
      },
      [
        {
          id: 'seg-a',
          sessionId: 'session-4',
          state: 'ON_SCREEN',
          startedAt: new Date('2026-03-15T12:00:00.000Z').toISOString(),
          endedAt: new Date('2026-03-15T12:10:00.000Z').toISOString(),
          durationMs: 600_000,
          confidence: 0.8,
          reason: 'Recovered segment A',
          source: 'INFERENCE',
          manualNote: null,
        },
        {
          id: 'seg-b',
          sessionId: 'session-4',
          state: 'DESK_WORK',
          startedAt: new Date('2026-03-15T12:10:00.000Z').toISOString(),
          endedAt: new Date('2026-03-15T12:15:00.000Z').toISOString(),
          durationMs: 300_000,
          confidence: 1,
          reason: 'Recovered segment B',
          source: 'MANUAL',
          manualNote: 'Manual',
        },
      ],
    )

    expect(runtime.totals.ON_SCREEN).toBe(600_000)
    expect(runtime.totals.DESK_WORK).toBe(300_000)
    expect(runtime.closedSegments).toHaveLength(2)
    expect(runtime.activeSegmentState).toBeNull()
  })
})
