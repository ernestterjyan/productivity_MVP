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
      source: 'INFERENCE',
      manualNote: null,
    })

    const finished = await client.finishSession({
      sessionId: session.id,
      endedAt: new Date('2026-03-15T10:25:00.000Z').toISOString(),
      elapsedMs: 25 * 60 * 1000,
      totals: {
        ON_SCREEN: 20 * 60 * 1000,
        DESK_WORK: 3 * 60 * 1000,
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
    expect(todaySummary?.totals.DESK_WORK).toBe(3 * 60 * 1000)
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
      source: 'INFERENCE',
      manualNote: null,
    })

    const bootstrapped = await createBrowserStorageClient().bootstrap()

    expect(bootstrapped.recentSessions).toHaveLength(0)
    expect(bootstrapped.todaySummary.trackedMs).toBe(0)
  })

  it('persists calibration settings and exports manual segment metadata', async () => {
    const client = createBrowserStorageClient()
    await client.saveSettings({
      webcamPreviewEnabled: true,
      debugModeEnabled: true,
      awayTimeoutMs: 6_000,
      screenFacingThreshold: 0.62,
      faceAwayThreshold: 0.3,
      deskWorkSensitivity: 62,
      deskWorkSustainMs: 2_800,
      transitionCooldownMs: 1_200,
      retentionEnabled: false,
      retentionDays: 30,
      startTrackingOnOpen: false,
      calibrationProfile: {
        calibratedAt: '2026-03-15T14:00:00.000Z',
        screenFacingBaseline: 0.84,
        recommendedScreenFacingThreshold: 0.74,
        deskWorkHeadDownBaseline: 0.87,
        recommendedHeadDownThreshold: 0.79,
        deskWorkScreenFacingUpperBound: 0.55,
        awayLossDelayMs: 1_000,
        recommendedAwayTimeoutMs: 3_000,
        screenSampleCount: 10,
        deskWorkSampleCount: 10,
        awaySampleCount: 3,
      },
    })

    const startedAt = new Date('2026-03-15T14:10:00.000Z').toISOString()
    const session = await client.createSession(startedAt)
    await client.appendStateSegment({
      id: 'segment-manual',
      sessionId: session.id,
      state: 'DESK_WORK',
      startedAt,
      endedAt: new Date('2026-03-15T14:12:00.000Z').toISOString(),
      durationMs: 120_000,
      confidence: 1,
      reason: 'Manual correction: marked as desk work.',
      source: 'MANUAL',
      manualNote: 'Manual correction: marked as desk work.',
    })
    await client.finishSession({
      sessionId: session.id,
      endedAt: new Date('2026-03-15T14:12:00.000Z').toISOString(),
      elapsedMs: 120_000,
      totals: {
        ON_SCREEN: 0,
        DESK_WORK: 120_000,
        AWAY: 0,
        UNCERTAIN: 0,
      },
    })

    const exported = await client.exportData()

    expect(exported.settings.calibrationProfile?.recommendedAwayTimeoutMs).toBe(3_000)
    expect(exported.stateSegments[0]?.source).toBe('MANUAL')
    expect(exported.stateSegments[0]?.manualNote).toContain('Manual correction')
  })

  it('migrates legacy writing totals and settings into desk-work fields', async () => {
    window.localStorage.setItem(
      'focus-estimate-store-v1',
      JSON.stringify({
        sessions: [
          {
            id: 'legacy-session',
            startedAt: '2026-03-14T09:00:00.000Z',
            endedAt: '2026-03-14T09:20:00.000Z',
            elapsedMs: 1_200_000,
            totals: {
              ON_SCREEN: 600_000,
              WRITING: 420_000,
              AWAY: 120_000,
              UNCERTAIN: 60_000,
            },
            status: 'COMPLETED',
          },
        ],
        segments: [],
        dailySummaries: [],
        settings: {
          webcamPreviewEnabled: true,
          debugModeEnabled: false,
          awayTimeoutMs: 6000,
          screenFacingThreshold: 0.62,
          faceAwayThreshold: 0.3,
          writingSensitivity: 70,
          writingSustainMs: 3100,
          retentionEnabled: false,
          retentionDays: 30,
          startTrackingOnOpen: false,
          transitionCooldownMs: 1200,
        },
      }),
    )

    const bootstrapped = await createBrowserStorageClient().bootstrap()

    expect(bootstrapped.recentSessions[0]?.totals.DESK_WORK).toBe(420_000)
    expect(bootstrapped.settings.deskWorkSensitivity).toBe(70)
    expect(bootstrapped.settings.deskWorkSustainMs).toBe(3100)
  })
})
