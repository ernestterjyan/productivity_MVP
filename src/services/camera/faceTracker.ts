import type { FaceLandmarker, FaceLandmarkerOptions } from '@mediapipe/tasks-vision'
import type { WebcamSignals } from '@/types/app'
import {
  DEFAULT_WEBCAM_SIGNALS,
  MEDIAPIPE_MODEL_PATH,
  MEDIAPIPE_WASM_PATH,
} from '@/services/inference/config'
import { extractFaceSignals } from './faceMath'

type FaceListener = (signals: WebcamSignals) => void
type ErrorListener = (message: string | null) => void

const FACE_OPTIONS: FaceLandmarkerOptions = {
  baseOptions: {
    modelAssetPath: MEDIAPIPE_MODEL_PATH,
  },
  runningMode: 'VIDEO',
  numFaces: 1,
  minFaceDetectionConfidence: 0.45,
  minFacePresenceConfidence: 0.4,
  minTrackingConfidence: 0.5,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: true,
}

export class FaceTracker {
  private listeners = new Set<FaceListener>()
  private errorListeners = new Set<ErrorListener>()
  private landmarker: FaceLandmarker | null = null
  private stream: MediaStream | null = null
  private frameHandle: number | null = null
  private videoElement: HTMLVideoElement | null = null
  private snapshot: WebcamSignals = DEFAULT_WEBCAM_SIGNALS
  private started = false

  subscribe(listener: FaceListener) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  subscribeToErrors(listener: ErrorListener) {
    this.errorListeners.add(listener)
    listener(null)
    return () => this.errorListeners.delete(listener)
  }

  async start(videoElement: HTMLVideoElement) {
    if (this.started && this.videoElement === videoElement) {
      return
    }

    this.started = true
    this.videoElement = videoElement

    try {
      await this.ensureLandmarker()
      await this.ensureVideoStream(videoElement)
      this.snapshot = { ...this.snapshot, cameraStatus: 'ACTIVE' }
      this.emitError(null)
      this.emit()
      this.loop()
    } catch (error) {
      this.started = false
      this.snapshot = {
        ...DEFAULT_WEBCAM_SIGNALS,
        cameraStatus: 'UNAVAILABLE',
        lastUpdatedAt: new Date().toISOString(),
      }
      this.emit()
      this.emitError(error instanceof Error ? error.message : 'Camera unavailable.')
    }
  }

  pause() {
    this.started = false

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }

    this.stopStream()
    this.snapshot = {
      ...this.snapshot,
      cameraStatus: 'PAUSED',
      faceDetected: false,
      faceCount: 0,
      screenFacingScore: 0,
      headDownScore: 0,
      yawBias: 0,
      pitchBias: 0,
      noFaceDurationMs: 0,
      lastUpdatedAt: new Date().toISOString(),
    }
    this.emit()
  }

  dispose() {
    this.pause()
    this.landmarker?.close()
    this.landmarker = null
    this.listeners.clear()
    this.errorListeners.clear()
  }

  private async ensureLandmarker() {
    if (this.landmarker) {
      return
    }

    const { FaceLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    )
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH)
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, FACE_OPTIONS)
  }

  private async ensureVideoStream(videoElement: HTMLVideoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser environment does not expose webcam access.')
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: 'user',
        },
      })
    }

    videoElement.srcObject = this.stream
    videoElement.muted = true
    videoElement.playsInline = true
    await videoElement.play()
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null

    if (this.videoElement) {
      this.videoElement.srcObject = null
    }
  }

  private loop = () => {
    if (!this.started || !this.landmarker || !this.videoElement) {
      return
    }

    if (this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const result = this.landmarker.detectForVideo(
        this.videoElement,
        performance.now(),
      )

      this.snapshot = extractFaceSignals(
        result,
        this.snapshot,
        Date.now(),
        'ACTIVE',
      )
      this.emit()
    }

    this.frameHandle = window.requestAnimationFrame(this.loop)
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot))
  }

  private emitError(message: string | null) {
    this.errorListeners.forEach((listener) => listener(message))
  }
}
