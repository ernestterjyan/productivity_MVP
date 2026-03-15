import type { ExportBundle, ExportFormat } from '@/types/app'

function escapeCsv(value: string | number | boolean | null) {
  const normalized = value === null ? '' : String(value)

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`
  }

  return normalized
}

function rowsToCsv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (rows.length === 0) {
    return ''
  }

  const headers = Object.keys(rows[0] ?? {})
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? null)).join(',')),
  ]

  return lines.join('\n')
}

export function buildExportFile(format: ExportFormat, bundle: ExportBundle) {
  const stamp = bundle.exportedAt.replaceAll(':', '-')

  if (format === 'JSON') {
    return {
      fileName: `focus-estimate-export-${stamp}.json`,
      mimeType: 'application/json',
      content: JSON.stringify(bundle, null, 2),
    }
  }

  if (format === 'SESSIONS_CSV') {
    return {
      fileName: `focus-estimate-sessions-${stamp}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: rowsToCsv(
        bundle.sessions.map((session) => ({
          id: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          elapsedMs: session.elapsedMs,
          onScreenMs: session.totals.ON_SCREEN,
          deskWorkMs: session.totals.DESK_WORK,
          awayMs: session.totals.AWAY,
          uncertainMs: session.totals.UNCERTAIN,
          status: session.status,
        })),
      ),
    }
  }

  if (format === 'SEGMENTS_CSV') {
    return {
      fileName: `focus-estimate-segments-${stamp}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: rowsToCsv(
        bundle.stateSegments.map((segment) => ({
          id: segment.id,
          sessionId: segment.sessionId,
          state: segment.state,
          startedAt: segment.startedAt,
          endedAt: segment.endedAt,
          durationMs: segment.durationMs,
          confidence: segment.confidence,
          source: segment.source,
          manualNote: segment.manualNote,
          reason: segment.reason,
        })),
      ),
    }
  }

  return {
    fileName: `focus-estimate-daily-${stamp}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content: rowsToCsv(
      bundle.dailySummaries.map((summary) => ({
        date: summary.date,
        trackedMs: summary.trackedMs,
        onScreenMs: summary.totals.ON_SCREEN,
        deskWorkMs: summary.totals.DESK_WORK,
        awayMs: summary.totals.AWAY,
        uncertainMs: summary.totals.UNCERTAIN,
      })),
    ),
  }
}

export function downloadExportFile(format: ExportFormat, bundle: ExportBundle) {
  const file = buildExportFile(format, bundle)
  const blob = new Blob([file.content], { type: file.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
