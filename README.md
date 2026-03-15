# Focus Estimate

Focus Estimate is a local-first desktop study tracker built with Tauri 2, React, TypeScript, MediaPipe Tasks Vision, and SQLite.

It estimates study behavior in real time using local webcam posture signals plus recent in-app input activity. It does not claim to measure true concentration or cognition.

Current user-facing states:

- `ON_SCREEN`
- `DESK_WORK`
- `AWAY`
- `UNCERTAIN`

## What The App Does

- Runs as a desktop app via Tauri 2
- Shows a live webcam preview with a clear camera status indicator
- Tracks session time by estimated state
- Uses local webcam inference to estimate:
  - face present / absent
  - roughly facing the screen / turned away
  - head-down posture consistent with desk work, note-taking, or reading
- Tracks in-app keyboard and pointer activity
- Applies smoothing, hold times, and cooldowns to reduce noisy state flapping
- Persists sessions, state segments, daily summaries, and settings locally
- Supports optional calibration to personalize thresholds
- Supports manual correction for the live session
- Supports local export of sessions, state segments, and daily summaries as JSON or CSV
- Includes a development debug panel for raw signals and transition internals

## What The App Does Not Do

- It does not detect “true focus”
- It does not read thoughts, comprehension, or attention directly
- It does not upload video to a server
- It does not record or store raw webcam footage
- It does not include cloud sync, telemetry, accounts, or productivity scoring gimmicks
- It does not do global OS-level keyboard or mouse tracking in v1

## Privacy Model

- Webcam processing stays on-device
- The app stores only derived data:
  - sessions
  - state segments
  - daily summaries
  - settings
- No cloud backend is used
- No account system exists
- The UI always shows a camera status badge
- Tracking can be paused immediately
- Export is local-only and contains derived study data, not recordings

## State Definitions

`ON_SCREEN`

- face visible
- head roughly aligned with the display
- recent interaction can raise confidence, but is not required

`DESK_WORK`

- face visible
- sustained head-down posture
- intended as an estimate for desk work, note-taking, writing, or reading
- not a direct detector for handwriting specifically

`AWAY`

- no face for at least the away timeout
- or face clearly turned away and the away candidate persists

`UNCERTAIN`

- weak, conflicting, or unavailable signals

## Calibration Flow

Calibration is optional. It helps tune thresholds to the user’s own posture and camera framing.

The flow asks the user to:

1. look at the screen normally
2. look down as if reading or taking notes
3. look away or leave the frame

From those short samples the app derives a local calibration profile for:

- screen-facing threshold
- head-down threshold
- away timeout recommendation

Calibration improves fit, but it does not make webcam heuristics a direct measurement of concentration.

## Manual Correction

During a live session, the user can manually mark the current segment as:

- on-screen
- desk work
- away
- uncertain

Manual corrections:

- affect only the active session
- create manual segments in the timeline
- are stored as manual overrides in exported segment data
- help interpretation when the automatic estimate is not good enough

The current implementation supports live correction only, not full retrospective editing of completed sessions.

## Inference Heuristics

The app uses explicit heuristics, not a custom ML model.

### Raw webcam signals

- `faceDetected`
- `screenFacingScore`
- `headDownScore`
- `yawBias`
- `pitchBias`
- `noFaceDurationMs`

### Raw activity signals

- recent in-app keyboard activity
- recent in-app pointer activity
- recent interaction timestamp
- approximate event counts per minute

### Smoothing

To reduce flicker, the engine applies:

- minimum hold times before promotion
- state-specific dwell time
- transition cooldowns
- explicit pending-state tracking

The core logic lives in:

- `src/services/inference/config.ts`
- `src/services/inference/engine.ts`

## Debug Mode

Debug mode shows:

- raw signals
- stable state
- candidate state
- confidence
- transition reason
- hold and cooldown timing
- active thresholds
- whether calibration is active
- whether a manual override is active

This is intended for development and threshold tuning.

## Local Persistence

Desktop mode stores data in SQLite via the Rust backend.

Tables / entities:

- `sessions`
- `state_segments`
- `daily_summaries`
- `app_settings`

During plain web preview, the app falls back to `localStorage` so the UI can still be exercised without the Tauri shell.

## Export

Export is local-only.

Available exports:

- full JSON export
- sessions CSV
- state segments CSV
- daily summaries CSV

Exported data includes:

- session start/end and totals
- segment timing, state, confidence, source, and manual note
- daily summaries
- current app settings

It does not include raw video.

## Security Notes

The Tauri config now uses a restrictive CSP instead of `null`.

Current security posture:

- production CSP limits scripts, media, workers, and assets to local sources
- development CSP allows the local Vite dev server and websocket HMR
- `freezePrototype` is enabled

Tradeoff:

- `style-src 'unsafe-inline'` is still allowed because the current React UI uses inline styles for state and camera badges
- `script-src 'wasm-unsafe-eval'` is allowed because local MediaPipe WASM needs it

These are narrower than the previous `null` CSP, but not maximally strict.

## Project Structure

```text
productivity_MVP/
  public/
    favicon.svg
    mediapipe/                  # generated by npm run setup:assets
    models/                     # generated by npm run setup:assets
  scripts/
    run-tauri.mjs
    setup-mediapipe.mjs
  src/
    components/
      CalibrationPanel.tsx
      DebugSignalsPanel.tsx
      HistoryPanel.tsx
      SessionControls.tsx
      SettingsPanel.tsx
      StateSummaryPanel.tsx
      StatsPanel.tsx
      TimelinePanel.tsx
      TopBar.tsx
      WebcamPanel.tsx
    hooks/
      useActivitySignals.ts
      useAttentionInference.ts
      useCameraTracking.ts
      useProductivityTracker.ts
    lib/
    services/
      activity/
      camera/
      inference/
      session/
      storage/
    styles/
    types/
    App.tsx
    main.tsx
  src-tauri/
    src/
      database.rs
      lib.rs
      main.rs
      models.rs
    Cargo.toml
    tauri.conf.json
  tests/
  README.md
```

## Setup

## Quick Start: Web Preview

If you only want to inspect the UI in the browser:

```bash
git clone https://github.com/ernestterjyan/productivity_MVP.git
cd productivity_MVP
source "$HOME/.nvm/nvm.sh"
npm install
npm run setup:assets
npm run dev
```

Then open `http://localhost:1420`.

## Desktop Setup On Ubuntu/Debian

Install Linux system packages:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config
```

Install Rust:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

Clone and run:

```bash
git clone https://github.com/ernestterjyan/productivity_MVP.git
cd productivity_MVP
source "$HOME/.nvm/nvm.sh"
npm install
npm run setup:assets
npm run tauri:check
npm run tauri:dev
```

If `cargo` was just installed and the shell still cannot find it:

```bash
source "$HOME/.cargo/env"
```

## Commands

Web preview:

```bash
source "$HOME/.nvm/nvm.sh"
npm run dev
```

Desktop preflight:

```bash
source "$HOME/.nvm/nvm.sh"
npm run tauri:check
```

Desktop dev:

```bash
source "$HOME/.nvm/nvm.sh"
npm run tauri:dev
```

Production web build:

```bash
source "$HOME/.nvm/nvm.sh"
npm run build
```

Tests:

```bash
source "$HOME/.nvm/nvm.sh"
npm run test
```

Lint:

```bash
source "$HOME/.nvm/nvm.sh"
npm run lint
```

## Desktop Troubleshooting

If you see this:

```text
failed to run 'cargo metadata' ... No such file or directory (os error 2)
```

Rust is not installed or the current shell does not have Cargo on `PATH`.

Run:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
cargo -V
```

Then retry:

```bash
npm run tauri:check
npm run tauri:dev
```

If you see a missing `webkit2gtk-4.1` error on Linux, install the desktop prerequisites:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config
```

## Current Verification Status

Verified in this environment:

- `npm run lint`
- `npm run build`
- `npm run test`
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps`

Not fully verifiable in this environment:

- `npm run tauri:dev`
- `npm run tauri:build`

Reason:

- this container still lacks the Linux WebKitGTK development packages required by Tauri
- the desktop preflight now fails early with exact install commands instead of dropping into a raw Cargo or pkg-config error

## Limitations

- The app estimates study behavior, not cognition
- “On screen” is head-orientation based, not gaze tracking
- `DESK_WORK` is a posture-based estimate, not a handwriting detector
- Webcam quality, lighting, and camera angle affect signal stability
- Activity tracking is in-app only in v1
- Sessions spanning midnight are still grouped by session start date
- Manual correction is live-only; completed sessions cannot yet be edited retroactively
- Export uses client-side file download behavior rather than a desktop save dialog
- The Tauri desktop runtime itself is still not end-to-end verified in this container

## Future Roadmap

- global OS-level activity tracking as an optional platform-specific extension
- retrospective correction for completed sessions
- better midnight day-splitting
- session tags or subjects
- confidence trend overlays
- CSV bundle export or desktop save dialog
- onboarding for camera permission and heuristic explanation
