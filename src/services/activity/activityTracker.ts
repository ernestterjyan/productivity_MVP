import type { ActivitySignals, InferenceConfig } from '@/types/app'
import { DEFAULT_ACTIVITY_SIGNALS } from '@/services/inference/config'

type ActivityListener = (snapshot: ActivitySignals) => void

export class ActivityTracker {
  private listeners = new Set<ActivityListener>()
  private keyboardEvents: number[] = []
  private pointerEvents: number[] = []
  private lastKeyboardAt: number | null = null
  private lastPointerAt: number | null = null
  private intervalId: number | null = null
  private active = false
  private config: Pick<InferenceConfig, 'activityWindowMs' | 'recentInteractionMs'>

  constructor(
    config: Pick<InferenceConfig, 'activityWindowMs' | 'recentInteractionMs'>,
  ) {
    this.config = config
  }

  subscribe(listener: ActivityListener) {
    this.listeners.add(listener)
    listener(this.createSnapshot(Date.now()))
    return () => this.listeners.delete(listener)
  }

  setConfig(
    config: Pick<InferenceConfig, 'activityWindowMs' | 'recentInteractionMs'>,
  ) {
    this.config = config
    this.emit()
  }

  start() {
    if (this.active) {
      return
    }

    this.active = true
    window.addEventListener('keydown', this.handleKeyboard, { passive: true })
    window.addEventListener('mousemove', this.handlePointer, { passive: true })
    window.addEventListener('mousedown', this.handlePointer, { passive: true })
    window.addEventListener('wheel', this.handlePointer, { passive: true })
    this.intervalId = window.setInterval(() => this.emit(), 1000)
    this.emit()
  }

  pause() {
    if (!this.active) {
      return
    }

    this.active = false
    window.removeEventListener('keydown', this.handleKeyboard)
    window.removeEventListener('mousemove', this.handlePointer)
    window.removeEventListener('mousedown', this.handlePointer)
    window.removeEventListener('wheel', this.handlePointer)

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.emit()
  }

  dispose() {
    this.pause()
    this.listeners.clear()
  }

  private handleKeyboard = () => {
    const now = Date.now()
    this.lastKeyboardAt = now
    this.keyboardEvents.push(now)
    this.emit()
  }

  private handlePointer = () => {
    const now = Date.now()
    this.lastPointerAt = now
    this.pointerEvents.push(now)
    this.emit()
  }

  private prune(now: number) {
    const cutoff = now - this.config.activityWindowMs
    this.keyboardEvents = this.keyboardEvents.filter((timestamp) => timestamp >= cutoff)
    this.pointerEvents = this.pointerEvents.filter((timestamp) => timestamp >= cutoff)
  }

  private createSnapshot(now: number): ActivitySignals {
    this.prune(now)

    const lastInteraction = [this.lastKeyboardAt, this.lastPointerAt]
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0]

    if (!this.active) {
      return {
        ...DEFAULT_ACTIVITY_SIGNALS,
        lastKeyboardAt: this.lastKeyboardAt
          ? new Date(this.lastKeyboardAt).toISOString()
          : null,
        lastPointerAt: this.lastPointerAt
          ? new Date(this.lastPointerAt).toISOString()
          : null,
        lastInteractionAt: lastInteraction
          ? new Date(lastInteraction).toISOString()
          : null,
      }
    }

    return {
      active: this.active,
      recentInteraction:
        lastInteraction !== undefined &&
        now - lastInteraction <= this.config.recentInteractionMs,
      recentKeyboard:
        this.lastKeyboardAt !== null &&
        now - this.lastKeyboardAt <= this.config.recentInteractionMs,
      recentPointer:
        this.lastPointerAt !== null &&
        now - this.lastPointerAt <= this.config.recentInteractionMs,
      lastInteractionAt: lastInteraction
        ? new Date(lastInteraction).toISOString()
        : null,
      lastKeyboardAt: this.lastKeyboardAt
        ? new Date(this.lastKeyboardAt).toISOString()
        : null,
      lastPointerAt: this.lastPointerAt
        ? new Date(this.lastPointerAt).toISOString()
        : null,
      keyboardEventsPerMinute: this.keyboardEvents.length,
      pointerEventsPerMinute: this.pointerEvents.length,
    }
  }

  private emit() {
    const snapshot = this.createSnapshot(Date.now())
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
