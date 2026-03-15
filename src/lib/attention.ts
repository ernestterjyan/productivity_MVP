import type { AttentionState, DailySummary, StateTotals } from '@/types/app'
import { toDateKey } from './time'

export const ATTENTION_STATES: AttentionState[] = [
  'ON_SCREEN',
  'DESK_WORK',
  'AWAY',
  'UNCERTAIN',
]

export const STATE_LABELS: Record<AttentionState, string> = {
  ON_SCREEN: 'On screen',
  DESK_WORK: 'Desk work',
  AWAY: 'Away',
  UNCERTAIN: 'Uncertain',
}

export const STATE_TINTS: Record<AttentionState, string> = {
  ON_SCREEN: '#2c7a66',
  DESK_WORK: '#d29034',
  AWAY: '#c25f52',
  UNCERTAIN: '#73808e',
}

export function createEmptyTotals(): StateTotals {
  return {
    ON_SCREEN: 0,
    DESK_WORK: 0,
    AWAY: 0,
    UNCERTAIN: 0,
  }
}

export function totalTrackedMs(totals: StateTotals) {
  return ATTENTION_STATES.reduce((sum, state) => sum + totals[state], 0)
}

export function addToTotals(
  totals: StateTotals,
  state: AttentionState,
  durationMs: number,
) {
  totals[state] += Math.max(0, durationMs)
}

export function cloneTotals(totals: StateTotals): StateTotals {
  return {
    ON_SCREEN: totals.ON_SCREEN,
    DESK_WORK: totals.DESK_WORK,
    AWAY: totals.AWAY,
    UNCERTAIN: totals.UNCERTAIN,
  }
}

export function createEmptyDailySummary(date = toDateKey()): DailySummary {
  return {
    date,
    trackedMs: 0,
    totals: createEmptyTotals(),
  }
}
