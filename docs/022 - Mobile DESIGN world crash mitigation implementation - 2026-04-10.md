# Mobile DESIGN World Crash Mitigation Implementation

## Date
- 2026-04-10

## Scope
- Implement the first mobile crash-mitigation pass from `021 - Mobile DESIGN world crash audit - 2026-04-10.md`.
- Keep the current mobile zoom ceiling and mobile-safe resolution levels unchanged.
- Avoid broad renderer rewrites.

## Implementation Plan
- Add runtime diagnostics for mobile real-device reports.
- Retry WebP on mobile under the current attach-before-load loader.
- Move mobile visible tile loading from lazy to eager.
- Add mobile interaction discipline:
  - keep the current level during active pan / pinch
  - add level-switch hysteresis
  - delay settled fill longer on mobile
- Replace visible-only mobile eviction with a small bounded LRU cache.
- Disable expensive DESIGN-surface drop shadows during mobile state B.
- Release tile elements after the game world fades out.

## Implemented

### 1. Runtime Diagnostics
- Added `DesignWorldLayer.getDiagnostics()`.
- Exposed a copyable report through:
  - `window.__noAiInDesign.getDiagnostics()`
- Current report includes:
  - active UI state
  - canvas state
  - renderer mode
  - tile format
  - tile loading / attach policy
  - current level
  - visible tile count
  - retained tile count
  - pending tile count
  - estimated decoded tile memory
  - created / removed / failed tile counters
  - recent level switches
  - recent image load errors

### 2. Mobile WebP Retry
- Mobile now uses existing WebP tile companions:
  - `tileExtension: "webp"`
- The retry keeps the mobile-safe loader strategy:
  - `tileAttachMode: "attach-before-load"`
- This avoids the earlier deferred/off-DOM mobile WebP loading path that was implicated in blank stage-B rendering.

### 3. Predictable Mobile Tile Loading
- Mobile visible tiles now use:
  - `tileLoading: "eager"`
- The mobile DESIGN-world tiles are critical interactive viewport content, not ordinary below-the-fold images.

### 4. Mobile Gesture Stabilization
- Mobile now keeps the current level stable during active pan / pinch:
  - `keepCurrentLevelWhileInteracting: true`
- Mobile now uses level-switch hysteresis:
  - `levelSwitchHysteresis: 0.4`
- Mobile settled-fill delay increased:
  - `settleDelayMs: 180`

### 5. Small Bounded Mobile Tile Cache
- Mobile moved from visible-only deletion to bounded LRU:
  - `tileEvictionPolicy: "lru"`
  - `maxRetainedTiles: 12`
- This should reduce rapid recreate / reload / decode churn while keeping a hard cap.

### 6. Mobile State-B Filter Reduction
- During mobile active game state only, `.design-world-surface` no longer uses the heavy drop-shadow filter stack.
- This reduces compositor pressure without changing tile resolution or zoom ceiling.

### 7. Post-Game Tile Release
- After the DESIGN world fades out in the reveal sequence, tile elements and pending tile work are cleared.
- This reduces retained image memory before reveal / replay.

## Files Changed
- `script.js`
- `design-world.js`
- `styles.css`
- `docs/022 - Mobile DESIGN world crash mitigation implementation - 2026-04-10.md`

## Validation
- `node --check script.js`
- `node --check design-world.js`
- `node --check infinite-canvas.js`
- `node --check generated/design-v2-smaller-pyramid/manifest.js`
- `python3 -m py_compile tools/export_webp_pyramid.py tools/measure_webp_savings.py`
- `git diff --check`
- Local HTTP smoke test:
  - `/` returned `200` as `text/html`
  - `/generated/design-v2-smaller-pyramid/manifest-mobile.json` returned `200` as `application/json`
  - `/generated/design-v2-smaller-pyramid/level-2/0-0.webp` returned `200` as `image/webp`

## Remaining Required Validation
- Real iPhone Safari stress testing is still required.
- The key test is not just initial render; it is repeated pinch / pan at max mobile zoom across the DESIGN world.
- Use `window.__noAiInDesign.getDiagnostics()` after a stress run to capture tile counts, level switches, image errors, and estimated decoded tile memory.

## Local Test Server
- Started local static server:
  - `http://127.0.0.1:8001/`
