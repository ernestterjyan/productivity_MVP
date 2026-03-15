import { createBrowserStorageClient } from '@/services/storage/browserStorage'
import { toDateKey } from '@/lib/time'

describe('browser storage client', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persists completed sessions across reloads', async () => {
    const client = createBrowserStorageClient()
    const startedAt = new Date('2026-03-15T10:00:00.000Z').toISOString()
    const session = await client.createSession(startedAt)

    await client.appendStateSegment({
      id: 'segment-1',
      sessionId: session.id,
      state: 'ON_SCREEN',
      startedAt,
      endedAt: new Date('2026-03-15T10:25:00.000Z').toISOString(),
      durationMs: 25 * 60 * 1000,
      confidence: 0.84,
      reason: 'Stable on-screen state.',
    })

    const finished = await client.finishSession({
      sessionId: session.id,
      endedAt: new Date('2026-03-15T10:25:00.000Z').toISOString(),
      elapsedMs: 25 * 60 * 1000,
      totals: {
        ON_SCREEN: 20 * 60 * 1000,
        WRITING: 3 * 60 * 1000,
        AWAY: 60 * 1000,
        UNCERTAIN: 60 * 1000,
      },
    })

    expect(finished.recentSessions).toHaveLength(1)
    expect(finished.recentSessions[0]?.id).toBe(session.id)

    const reloaded = await createBrowserStorageClient().bootstrap()
    const todaySummary = reloaded.dailyHistory.find(
      (summary) => summary.date === toDateKey(startedAt),
    )

    expect(todaySummary?.trackedMs).toBe(25 * 60 * 1000)
    expect(todaySummary?.totals.ON_SCREEN).toBe(20 * 60 * 1000)
    expect(reloaded.settings.webcamPreviewEnabled).toBe(true)
  })

  it('drops abandoned active sessions during bootstrap cleanup', async () => {
    const client = createBrowserStorageClient()
    const startedAt = new Date('2026-03-15T12:00:00.000Z').toISOString()
    const session = await client.createSession(startedAt)

    await client.appendStateSegment({
      id: 'abandoned-segment',
      sessionId: session.id,
      state: 'UNCERTAIN',
      startedAt,
      endedAt: new Date('2026-03-15T12:01:00.000Z').toISOString(),
      durationMs: 60_000,
      confidence: 0.22,
      reason: 'Abandoned startup segment.',
    })

    const bootstrapped = await createBrowserStorageClient().bootstrap()

    expect(bootstrapped.recentSessions).toHaveLength(0)
    expect(bootstrapped.todaySummary.trackedMs).toBe(0)
  })
})
