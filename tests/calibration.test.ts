import { DEFAULT_SETTINGS } from '@/services/inference/config'
import {
  createEmptyCalibrationSamples,
  deriveCalibrationProfile,
} from '@/services/inference/calibration'

describe('calibration profile derivation', () => {
  it('returns a profile when enough samples are present', () => {
    const samples = createEmptyCalibrationSamples()
    samples.screenFacingSamples = Array.from({ length: 10 }, () => 0.82)
    samples.deskWorkHeadDownSamples = Array.from({ length: 10 }, () => 0.88)
    samples.deskWorkScreenFacingSamples = Array.from({ length: 10 }, () => 0.46)
    samples.awayLossDelaySamples = [900, 1_100, 1_000]

    const profile = deriveCalibrationProfile(samples, DEFAULT_SETTINGS)

    expect(profile).not.toBeNull()
    expect(profile?.recommendedScreenFacingThreshold).toBeGreaterThan(0.6)
    expect(profile?.recommendedHeadDownThreshold).toBeGreaterThan(0.7)
    expect(profile?.recommendedAwayTimeoutMs).toBeGreaterThanOrEqual(3_000)
  })

  it('returns null when there are not enough samples', () => {
    const samples = createEmptyCalibrationSamples()
    samples.screenFacingSamples = [0.8]
    samples.deskWorkHeadDownSamples = [0.9]
    samples.awayLossDelaySamples = [1_000]

    expect(deriveCalibrationProfile(samples, DEFAULT_SETTINGS)).toBeNull()
  })
})
