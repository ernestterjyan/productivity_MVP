import { invoke } from '@tauri-apps/api/core'
import type {
  AppSettings,
  BootstrapPayload,
  ExportBundle,
  PersistedSegmentInput,
  SessionCompletionInput,
  SessionSeed,
} from '@/types/app'
import type { StorageClient } from './client'

export function createTauriStorageClient(): StorageClient {
  return {
    bootstrap() {
      return invoke<BootstrapPayload>('bootstrap')
    },
    createSession(startedAt: string) {
      return invoke<SessionSeed>('create_session', { startedAt })
    },
    appendStateSegment(segment: PersistedSegmentInput) {
      return invoke('append_state_segment', { segment })
    },
    finishSession(payload: SessionCompletionInput) {
      return invoke<BootstrapPayload>('finish_session', { payload })
    },
    deleteSession(sessionId: string) {
      return invoke<BootstrapPayload>('delete_session', { sessionId })
    },
    saveSettings(settings: AppSettings) {
      return invoke<BootstrapPayload>('save_settings', { settings })
    },
    exportData() {
      return invoke<ExportBundle>('export_data')
    },
  }
}
