# Desktop DESIGN World Optimization Audit

## Date
- 2026-04-10

## Scope
- Audited the desktop DESIGN-world rendering path.
- Evaluated how to improve desktop smoothness and speed without reducing visual quality or zoom level.
- No code changes were made as part of this audit.

## Current Desktop Path
- Desktop still uses the full-quality pyramid in `generated/design-v2-smaller-pyramid/manifest.json`.
- Desktop config in `script.js` still uses:
  - `useOverview: true`
  - `tileLoading: "eager"`
  - `tileBuffer: 1`
  - `tileEvictionPolicy: "none"`
  - `maxRetainedTiles: Infinity`
  - `maxScale: 1`
- The mobile-safe path is isolated and does not replace the desktop manifest or desktop zoom ceiling.

## Asset Pressure
- Total pyramid size on disk is about `309 MB`.
- Per-level totals:
  - `level-0`: `180` tiles, average about `1.32 MB`, max about `2.10 MB`, total about `231.9 MB`
  - `level-1`: `45` tiles, average about `1.28 MB`, total about `56.4 MB`
  - `level-2`: `16` tiles, average about `0.90 MB`, total about `14.0 MB`
  - `level-3`: `4` tiles, total about `3.6 MB`
  - `level-4`: `2` tiles, total about `1.0 MB`
  - `level-5`: `1` tile, total about `0.3 MB`
- Estimated visible `level-0` tile counts with `tileBuffer: 1`:
  - `1440x900`: about `12`
  - `1728x1117`: about `16`
  - `1920x1080`: about `16`
  - `2560x1440`: about `20`
- Rough decoded memory for visible `1024x1024` RGBA tiles alone:
  - `12` tiles: about `48 MB`
  - `16` tiles: about `64 MB`
  - `20` tiles: about `80 MB`
- This does not include previously visited tiles, other levels, browser caches, overview image memory, or GPU copies.

## Primary Findings

### 1. Desktop Retains Too Much Tile Memory Over Time
- In the current desktop path, old tiles are hidden rather than removed.
- Desktop does not use eviction because `tileEvictionPolicy` is `none` and `maxRetainedTiles` is effectively unbounded.
- Over long pan sessions, desktop can accumulate a large number of decoded tiles, which increases memory pressure and eventually hurts smoothness.

### 2. Tile Decode Likely Causes Visible Hitches
- Tiles are attached to the DOM immediately after `src` is assigned.
- `decoding="async"` is only a hint and does not guarantee hitch-free first paint.
- Large PNG tiles decoding while the user pans or zooms are a likely cause of interaction stutter.

### 3. Level Switching Is Too Eager
- The current level picker always chooses the mathematically closest level to the current scale.
- This is clean logically, but it can create churn near zoom boundaries.
- Repeated level flips during interaction trigger extra loading, DOM work, and decode work.

### 4. The Renderer Does Too Much During Active Movement
- During pan and zoom, the system both moves the world and makes new tile-loading decisions immediately.
- That is expensive at the exact moment smoothness matters most.
- Interaction and post-interaction fill should be treated differently.

### 5. The Grid Canvas Propagates More State Than Necessary
- `InfiniteCanvasBackground` notifies state changes from setters and pointer handlers, then also notifies again during render.
- That can drive redundant `designWorld.setView(...)` and `scheduleTileRender()` work.
- The background grid and the tile-world renderer are more tightly coupled than they need to be.

### 6. PNG Is Likely Too Expensive For Interactive Desktop Tile Browsing
- PNG preserves quality, but it is costly in bytes for this kind of experience.
- For interactive tile browsing, smaller transfer size must be balanced against decode cost.
- A better format may reduce transfer and improve responsiveness without changing perceived quality.

## Recommended Optimization Order

### 1. Add a Bounded Desktop Tile Cache With LRU Eviction
- Highest-confidence win without quality loss.
- Keep current visible tiles plus one or two extra screenfuls.
- Suggested target: roughly `40-60` retained desktop tiles.
- This stabilizes long-session memory while keeping revisits fast.

### 2. Decode Tiles Before Attaching Them
- Load tile data first, then attach only after decode completes.
- Keep the overview image or previous-level tile visible until the replacement is ready.
- This reduces first-paint hitches and improves perceived smoothness during navigation.

### 3. Add Hysteresis To Level Switching
- Do not switch levels at the exact mathematical crossover point.
- Keep the current level until the next level is clearly better by a margin or for a short duration.
- This reduces flip-flop behavior near zoom thresholds.

### 4. Split “Active Move” From “Settled Fill”
- While the user is actively dragging or zooming:
  - keep the current level stable
  - avoid aggressive tile churn
- Once motion settles:
  - fill edge tiles
  - upgrade detail where needed
- This preserves final quality while improving interaction smoothness.

### 5. Remove Redundant Render-Loop State Propagation
- Notify world state only when camera values actually change.
- Do not push world updates again from every background-canvas render if nothing relevant changed.
- This lowers avoidable main-thread work.

### 6. Re-Encode Desktop Tiles To A Better Format
- Test lossless WebP first.
- If needed, test visually lossless near-lossless WebP.
- For this project, interactive feel matters more than absolute compression ratio.
- AVIF may reduce bytes further but can be worse for decode-heavy interactive browsing.

### 7. Prefetch Intelligently
- Prefetch one ring beyond the current viewport when idle.
- Bias toward pan direction rather than fetching broadly.
- This can make panning feel anticipatory instead of reactive.

### 8. Consider a Canvas/WebGL Tile Compositor Long-Term
- This is the architectural endgame if the current DOM-image approach still feels limiting.
- Benefits:
  - lower DOM overhead
  - tighter memory control
  - explicit draw scheduling
- Tradeoff:
  - meaningful implementation cost

## Recommended Immediate Implementation Sequence
1. Add bounded desktop LRU tile retention.
2. Decode tiles before attach/swap.
3. Add level-switch hysteresis.
4. Separate active-drag behavior from settled-fill behavior.
5. Reduce redundant canvas-to-world update churn.
6. Test lossless WebP tile exports.
7. Add directional idle prefetching.

## What Not To Do First
- Do not lower desktop zoom ceiling.
- Do not remove the desktop overview image first.
- Do not assume the mobile-safe strategy is correct for desktop.
- Do not jump straight to AVIF-only tiles for an interaction-heavy surface.

## Conclusion
- Yes, the desktop DESIGN world can be made materially faster and smoother without reducing zoom level or visual quality.
- The biggest gains come from:
  - controlling tile memory
  - avoiding decode shocks
  - reducing level churn
  - reducing work during active interaction
- This is not a one-tweak problem, but the optimization path is clear and technically realistic.
