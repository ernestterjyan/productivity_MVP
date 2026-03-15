import { DEFAULT_SETTINGS } from '@/services/inference/config'
import { buildExportFile } from '@/services/storage/exporters'

describe('export builders', () => {
  const bundle = {
    exportedAt: '2026-03-15T12:00:00.000Z',
    settings: DEFAULT_SETTINGS,
    sessions: [
      {
        id: 'session-1',
        startedAt: '2026-03-15T09:00:00.000Z',
        endedAt: '2026-03-15T09:30:00.000Z',
        elapsedMs: 1_800_000,
        totals: {
          ON_SCREEN: 1_200_000,
          DESK_WORK: 300_000,
          AWAY: 180_000,
          UNCERTAIN: 120_000,
        },
        status: 'COMPLETED' as const,
      },
    ],
    stateSegments: [
      {
        id: 'segment-1',
        sessionId: 'session-1',
        state: 'DESK_WORK' as const,
        startedAt: '2026-03-15T09:10:00.000Z',
        endedAt: '2026-03-15T09:15:00.000Z',
        durationMs: 300_000,
        confidence: 1,
        reason: 'Manual correction: marked as desk work.',
        source: 'MANUAL' as const,
        manualNote: 'Manual correction: marked as desk work.',
      },
    ],
    dailySummaries: [
      {
        date: '2026-03-15',
        trackedMs: 1_800_000,
        totals: {
          ON_SCREEN: 1_200_000,
          DESK_WORK: 300_000,
          AWAY: 180_000,
          UNCERTAIN: 120_000,
        },
      },
    ],
  }

  it('builds sessions csv output with desk-work naming', () => {
    const file = buildExportFile('SESSIONS_CSV', bundle)

    expect(file.fileName).toContain('sessions')
    expect(file.content).toContain('deskWorkMs')
    expect(file.content).toContain('1800000')
  })

  it('builds json output with manual segment metadata', () => {
    const file = buildExportFile('JSON', bundle)

    expect(file.fileName).toContain('.json')
    expect(file.content).toContain('"source": "MANUAL"')
    expect(file.content).toContain('"DESK_WORK"')
  })
})
