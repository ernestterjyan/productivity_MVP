import type {
  AppSettings,
  BootstrapPayload,
  ExportBundle,
  PersistedSegmentInput,
  SessionCompletionInput,
  SessionSeed,
} from '@/types/app'
import { isTauriEnvironment } from '@/lib/platform'
import { createBrowserStorageClient } from './browserStorage'
import { createTauriStorageClient } from './tauriStorage'

export interface StorageClient {
  bootstrap(): Promise<BootstrapPayload>
  createSession(startedAt: string): Promise<SessionSeed>
  appendStateSegment(segment: PersistedSegmentInput): Promise<void>
  finishSession(payload: SessionCompletionInput): Promise<BootstrapPayload>
  deleteSession(sessionId: string): Promise<BootstrapPayload>
  saveSettings(settings: AppSettings): Promise<BootstrapPayload>
  exportData(): Promise<ExportBundle>
}

let client: StorageClient | null = null

export function getStorageClient(): StorageClient {
  if (!client) {
    client = isTauriEnvironment()
      ? createTauriStorageClient()
      : createBrowserStorageClient()
  }

  return client
}
