# Mobile Tile Attach Restore

## Date
- 2026-04-10

## Scope
- Restored the old mobile tile-loading behavior after real-device Safari still showed a blank DESIGN world in stage B.

## Problem
- The desktop optimization pass changed tile loading to support deferred attach and decode-first behavior.
- That path is acceptable for desktop, but it is not reliable enough for the current mobile Safari runtime.
- The blank stage-B screenshot is consistent with mobile tiles never making it into the DOM render path in time.

## Fix
- Added `attachBeforeLoad` support in `design-world.js`.
- Enabled it only for the mobile-safe path in `script.js`.
- Mobile now returns to the old model:
  - create tile element
  - attach tile to the DOM immediately
  - let the browser load it in place
- Also restored the mobile tile loading hint to:
  - `tileLoading: "lazy"`

## What Stayed The Same
- Mobile still uses:
  - PNG tiles
  - levels `2-5`
  - `useOverview: false`
  - `visible-only` eviction
  - `maxRetainedTiles: 6`
  - `maxScale: 0.4`
- Desktop still keeps:
  - WebP
  - decode-before-attach
  - bounded LRU retention
  - level hysteresis and settled-fill behavior

## Validation
- `node --check design-world.js`
- `node --check script.js`
- `git diff --check`

## Conclusion
- Mobile now uses the last known-good tile attachment strategy inside the current renderer, instead of continuing to inherit the desktop-first loading behavior.
