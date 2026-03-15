import type {
  AppSettings,
  CalibrationProfile,
  WebcamSignals,
} from '@/types/app'
import { clamp } from '@/lib/time'

export interface CalibrationSamples {
  screenFacingSamples: number[]
  deskWorkHeadDownSamples: number[]
  deskWorkScreenFacingSamples: number[]
  awayLossDelaySamples: number[]
}

export function createEmptyCalibrationSamples(): CalibrationSamples {
  return {
    screenFacingSamples: [],
    deskWorkHeadDownSamples: [],
    deskWorkScreenFacingSamples: [],
    awayLossDelaySamples: [],
  }
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function captureScreenCalibrationSample(
  samples: CalibrationSamples,
  webcam: WebcamSignals,
) {
  if (!webcam.faceDetected) {
    return samples
  }

  samples.screenFacingSamples.push(webcam.screenFacingScore)
  return samples
}

export function captureDeskWorkCalibrationSample(
  samples: CalibrationSamples,
  webcam: WebcamSignals,
) {
  if (!webcam.faceDetected) {
    return samples
  }

  samples.deskWorkHeadDownSamples.push(webcam.headDownScore)
  samples.deskWorkScreenFacingSamples.push(webcam.screenFacingScore)
  return samples
}

export function captureAwayCalibrationSample(
  samples: CalibrationSamples,
  webcam: WebcamSignals,
  stepStartedAtMs: number,
  observedAtMs: number,
) {
  if (webcam.faceDetected) {
    return samples
  }

  samples.awayLossDelaySamples.push(Math.max(0, observedAtMs - stepStartedAtMs))
  return samples
}

export function deriveCalibrationProfile(
  samples: CalibrationSamples,
  settings: AppSettings,
  calibratedAt = new Date().toISOString(),
): CalibrationProfile | null {
  if (
    samples.screenFacingSamples.length < 8 ||
    samples.deskWorkHeadDownSamples.length < 8 ||
    samples.awayLossDelaySamples.length < 2
  ) {
    return null
  }

  const screenFacingBaseline = average(samples.screenFacingSamples)
  const deskWorkHeadDownBaseline = average(samples.deskWorkHeadDownSamples)
  const deskWorkScreenFacingAverage = average(samples.deskWorkScreenFacingSamples)
  const awayLossDelayMs = Math.round(average(samples.awayLossDelaySamples))

  return {
    calibratedAt,
    screenFacingBaseline,
    recommendedScreenFacingThreshold: clamp(
      screenFacingBaseline - 0.08,
      0.35,
      0.92,
    ),
    deskWorkHeadDownBaseline,
    recommendedHeadDownThreshold: clamp(
      deskWorkHeadDownBaseline - 0.08,
      0.34,
      0.96,
    ),
    deskWorkScreenFacingUpperBound: clamp(
      deskWorkScreenFacingAverage + 0.08,
      settings.faceAwayThreshold + 0.1,
      0.92,
    ),
    awayLossDelayMs,
    recommendedAwayTimeoutMs: Math.round(
      clamp(awayLossDelayMs + 1800, 3000, 12000),
    ),
    screenSampleCount: samples.screenFacingSamples.length,
    deskWorkSampleCount: samples.deskWorkHeadDownSamples.length,
    awaySampleCount: samples.awayLossDelaySamples.length,
  }
}
