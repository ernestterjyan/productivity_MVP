import { DEFAULT_ACTIVITY_SIGNALS, DEFAULT_SETTINGS, DEFAULT_WEBCAM_SIGNALS, toInferenceConfig } from '@/services/inference/config'
import { AttentionInferenceEngine } from '@/services/inference/engine'

describe('attention inference engine', () => {
  it('holds a new on-screen state before promoting it', () => {
    const engine = new AttentionInferenceEngine()
    const config = toInferenceConfig(DEFAULT_SETTINGS)
    const webcam = {
      ...DEFAULT_WEBCAM_SIGNALS,
      cameraStatus: 'ACTIVE' as const,
      faceDetected: true,
      screenFacingScore: 0.86,
      headDownScore: 0.18,
      lastUpdatedAt: new Date(1_000).toISOString(),
      lastFaceSeenAt: new Date(1_000).toISOString(),
    }
    const activity = {
      ...DEFAULT_ACTIVITY_SIGNALS,
      active: true,
      recentInteraction: true,
      recentPointer: true,
    }

    const initial = engine.update(webcam, activity, config, 1_000)
    expect(initial.state).toBe('UNCERTAIN')
    expect(initial.candidateState).toBe('ON_SCREEN')

    const promoted = engine.update(
      { ...webcam, lastUpdatedAt: new Date(2_600).toISOString() },
      activity,
      config,
      2_600,
    )

    expect(promoted.state).toBe('ON_SCREEN')
    expect(promoted.candidateState).toBe('ON_SCREEN')
  })

  it('does not jump straight to away while interaction is still recent', () => {
    const engine = new AttentionInferenceEngine()
    const config = toInferenceConfig(DEFAULT_SETTINGS)
    const screenFacingWebcam = {
      ...DEFAULT_WEBCAM_SIGNALS,
      cameraStatus: 'ACTIVE' as const,
      faceDetected: true,
      screenFacingScore: 0.88,
      headDownScore: 0.1,
      lastUpdatedAt: new Date(1_000).toISOString(),
      lastFaceSeenAt: new Date(1_000).toISOString(),
    }
    const settled = engine.update(
      screenFacingWebcam,
      { ...DEFAULT_ACTIVITY_SIGNALS, active: true, recentInteraction: true, recentPointer: true },
      config,
      1_000,
    )
    engine.update(screenFacingWebcam, { ...DEFAULT_ACTIVITY_SIGNALS, active: true, recentInteraction: true, recentPointer: true }, config, 2_600)

    expect(settled.candidateState).toBe('ON_SCREEN')

    const turnedAwayButActive = engine.update(
      {
        ...screenFacingWebcam,
        screenFacingScore: 0.1,
        lastUpdatedAt: new Date(4_000).toISOString(),
      },
      {
        ...DEFAULT_ACTIVITY_SIGNALS,
        active: true,
        recentInteraction: true,
        recentPointer: true,
      },
      config,
      4_000,
    )

    expect(turnedAwayButActive.candidateState).toBe('UNCERTAIN')
    expect(turnedAwayButActive.state).toBe('ON_SCREEN')
  })

  it('promotes away only after the away signal stays stable', () => {
    const engine = new AttentionInferenceEngine()
    const config = toInferenceConfig(DEFAULT_SETTINGS)
    const awayWebcam = {
      ...DEFAULT_WEBCAM_SIGNALS,
      cameraStatus: 'ACTIVE' as const,
      faceDetected: false,
      noFaceDurationMs: config.awayTimeoutMs + 500,
      lastUpdatedAt: new Date(8_000).toISOString(),
      lastFaceSeenAt: new Date(1_000).toISOString(),
    }

    const first = engine.update(
      awayWebcam,
      DEFAULT_ACTIVITY_SIGNALS,
      config,
      8_000,
    )
    const second = engine.update(
      awayWebcam,
      DEFAULT_ACTIVITY_SIGNALS,
      config,
      9_400,
    )

    expect(first.state).toBe('UNCERTAIN')
    expect(first.candidateState).toBe('AWAY')
    expect(second.state).toBe('AWAY')
  })
})
