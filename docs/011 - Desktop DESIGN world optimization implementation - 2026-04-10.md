# Desktop DESIGN World Optimization Implementation

## Date
- 2026-04-10

## Scope
- Implemented the first desktop optimization block from `010 - Desktop DESIGN world optimization audit - 2026-04-10.md`.
- Kept desktop zoom ceiling and asset quality unchanged.
- Left asset-format work and prefetching for a later pass because they require a separate export / tuning cycle.

## Implemented

### 1. Bounded Desktop Tile Retention
- Desktop no longer keeps an effectively unbounded tile set in memory.
- The desktop path now uses:
  - `tileEvictionPolicy: "lru"`
  - `maxRetainedTiles: 48`
- Hidden desktop tiles are now evicted by least-recently-used order instead of accumulating forever across long pan sessions.

### 2. Decode Before Attach
- Desktop tiles now load and complete decode before being attached to the DOM.
- This keeps the overview image available underneath while high-detail tiles are still loading.
- The goal is to reduce first-paint hitching from large tile decode work landing directly in the interaction path.

### 3. Level-Switch Hysteresis
- Added hysteresis to desktop level selection so the renderer does not switch levels at the exact mathematical crossover.
- This reduces flip-flop behavior near zoom thresholds.

### 4. Active Move vs Settled Fill
- Added an interaction-aware render split:
  - during active movement, desktop uses a smaller tile buffer and keeps the current level stable
  - after movement settles, desktop fills back out using the normal tile buffer and final level selection
- This is intended to reduce tile churn during drag / zoom without changing the final rendered detail.

### 5. Reduced Canvas-to-World Update Churn
- `InfiniteCanvasBackground` no longer pushes world state from every background-canvas render frame.
- World updates now happen from actual state-change points instead of from the paint loop itself.

## Files Changed
- `design-world.js`
- `infinite-canvas.js`
- `script.js`

## Desktop Config Added
- `decodeBeforeAttach: true`
- `interactiveTileBuffer: 0`
- `tileEvictionPolicy: "lru"`
- `maxRetainedTiles: 48`
- `keepCurrentLevelWhileInteracting: true`
- `levelSwitchHysteresis: 0.35`
- `settleDelayMs: 120`

## Validation
- Ran:
  - `node --check design-world.js`
  - `node --check infinite-canvas.js`
  - `node --check script.js`
- Reviewed the desktop-config diff to confirm the desktop path still uses the full manifest and `maxScale: 1`.

## Not Yet Implemented
- Desktop lossless WebP export test
- Directional idle prefetching
- Canvas / WebGL tile compositor rewrite

## Expected Effect
- Smoother long pan sessions on desktop
- Less memory growth over time
- Less zoom-level thrash near boundaries
- Fewer interaction hitches caused by direct tile decode / swap timing
