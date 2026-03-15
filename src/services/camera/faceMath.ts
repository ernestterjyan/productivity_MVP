import type {
  FaceLandmarkerResult,
  Matrix,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import type { CameraStatus, WebcamSignals } from '@/types/app'
import { clamp } from '@/lib/time'
import { DEFAULT_WEBCAM_SIGNALS } from '@/services/inference/config'

const FACE_POINTS = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  mouthLeft: 61,
  mouthRight: 291,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  leftCheek: 234,
  rightCheek: 454,
}

const EPSILON = 0.0001

function pointAt(landmarks: NormalizedLandmark[], index: number) {
  return landmarks[index] ?? { x: 0, y: 0, z: 0 }
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  }
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function parseOrientation(matrix: Matrix | undefined) {
  if (!matrix || matrix.data.length < 16) {
    return null
  }

  const { data } = matrix
  const r11 = data[0]
  const r21 = data[4]
  const r31 = data[8]
  const r32 = data[9]
  const r33 = data[10]

  const yaw = Math.atan2(r21, r11) * (180 / Math.PI)
  const pitch = Math.atan2(-r31, Math.hypot(r32, r33)) * (180 / Math.PI)

  return {
    yawBias: clamp(yaw / 35, -1, 1),
    pitchBias: clamp(pitch / 30, -1, 1),
  }
}

export function extractFaceSignals(
  result: FaceLandmarkerResult,
  previous: WebcamSignals = DEFAULT_WEBCAM_SIGNALS,
  now = Date.now(),
  cameraStatus: CameraStatus,
): WebcamSignals {
  const faceLandmarks = result.faceLandmarks?.[0]
  const lastUpdatedAt = new Date(now).toISOString()

  if (!faceLandmarks) {
    const lastFaceSeen = previous.lastFaceSeenAt
      ? Date.parse(previous.lastFaceSeenAt)
      : null

    return {
      ...previous,
      cameraStatus,
      faceDetected: false,
      faceCount: 0,
      screenFacingScore: 0,
      headDownScore: 0,
      yawBias: 0,
      pitchBias: 0,
      lastUpdatedAt,
      noFaceDurationMs: lastFaceSeen ? Math.max(0, now - lastFaceSeen) : 0,
    }
  }

  const nose = pointAt(faceLandmarks, FACE_POINTS.noseTip)
  const forehead = pointAt(faceLandmarks, FACE_POINTS.forehead)
  const chin = pointAt(faceLandmarks, FACE_POINTS.chin)
  const leftEye = pointAt(faceLandmarks, FACE_POINTS.leftEyeOuter)
  const rightEye = pointAt(faceLandmarks, FACE_POINTS.rightEyeOuter)
  const leftCheek = pointAt(faceLandmarks, FACE_POINTS.leftCheek)
  const rightCheek = pointAt(faceLandmarks, FACE_POINTS.rightCheek)
  const mouth = midpoint(
    pointAt(faceLandmarks, FACE_POINTS.mouthLeft),
    pointAt(faceLandmarks, FACE_POINTS.mouthRight),
  )
  const eyeMid = midpoint(leftEye, rightEye)
  const cheekSpan = distance(leftCheek, rightCheek) + EPSILON
  const eyeSpan = distance(leftEye, rightEye) + EPSILON
  const leftBalance = Math.abs(nose.x - leftCheek.x)
  const rightBalance = Math.abs(rightCheek.x - nose.x)
  const symmetryScore =
    1 - Math.abs(leftBalance - rightBalance) / (leftBalance + rightBalance + EPSILON)
  const centeredNoseScore = 1 - Math.abs(nose.x - eyeMid.x) / (eyeSpan * 0.75)
  const noseVerticalPosition =
    (nose.y - forehead.y) / (Math.max(chin.y - forehead.y, EPSILON))
  const mouthVerticalPosition =
    (mouth.y - forehead.y) / (Math.max(chin.y - forehead.y, EPSILON))
  const rawPitchBias = clamp((noseVerticalPosition - 0.48) / 0.22, -1, 1)
  const matrixOrientation = parseOrientation(result.facialTransformationMatrixes?.[0])
  const yawBias =
    matrixOrientation?.yawBias ??
    clamp((leftBalance - rightBalance) / cheekSpan, -1, 1)
  const pitchBias = matrixOrientation?.pitchBias ?? rawPitchBias
  const screenFacingScore = clamp(
    symmetryScore * 0.5 +
      clamp(centeredNoseScore, 0, 1) * 0.35 +
      (1 - Math.abs(yawBias)) * 0.15,
  )
  const headDownScore = clamp(
    clamp((noseVerticalPosition - 0.54) / 0.22, 0, 1) * 0.7 +
      clamp((mouthVerticalPosition - 0.75) / 0.12, 0, 1) * 0.1 +
      clamp((pitchBias + 0.1) / 0.9, 0, 1) * 0.2,
  )

  return {
    cameraStatus,
    faceDetected: true,
    faceCount: result.faceLandmarks.length,
    screenFacingScore,
    headDownScore,
    yawBias,
    pitchBias,
    noFaceDurationMs: 0,
    lastUpdatedAt,
    lastFaceSeenAt: lastUpdatedAt,
  }
}
