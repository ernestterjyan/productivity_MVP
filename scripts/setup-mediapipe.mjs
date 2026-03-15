import { access, copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const wasmSourceDir = path.join(
  projectRoot,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm',
)
const wasmTargetDir = path.join(projectRoot, 'public', 'mediapipe')
const modelTargetPath = path.join(
  projectRoot,
  'public',
  'models',
  'face_landmarker.task',
)
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

async function exists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function copyWasmAssets() {
  await mkdir(wasmTargetDir, { recursive: true })
  const assets = await readdir(wasmSourceDir)

  await Promise.all(
    assets.map((asset) =>
      copyFile(path.join(wasmSourceDir, asset), path.join(wasmTargetDir, asset)),
    ),
  )
}

async function ensureModelAsset() {
  await mkdir(path.dirname(modelTargetPath), { recursive: true })

  if (await exists(modelTargetPath)) {
    return
  }

  const response = await fetch(modelUrl)

  if (!response.ok) {
    throw new Error(`Model download failed with status ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(modelTargetPath, buffer)
}

async function main() {
  try {
    await copyWasmAssets()
  } catch (error) {
    console.warn('[setup-mediapipe] Failed to copy WASM assets:', error)
  }

  try {
    await ensureModelAsset()
  } catch (error) {
    console.warn(
      '[setup-mediapipe] Failed to download the face landmarker model. Run `npm run setup:assets` again when network access is available.',
    )
    console.warn(error)
  }
}

await main()
