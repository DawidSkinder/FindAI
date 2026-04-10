# Mobile WebP Runtime Fix

## Date
- 2026-04-10

## Scope
- Fixed the mobile DESIGN-world path after the mobile WebP switch caused the world not to appear.

## Cause
- Mobile was the only path still configured with `tileLoading: "lazy"`.
- The current tile loader preloads each image before attaching it to the DOM.
- That means mobile was combining:
  - off-DOM image loading
  - `loading="lazy"`
  - Safari-class mobile behavior
- That combination is fragile and can prevent mobile tiles from loading reliably.

## Fix
- Changed the mobile tile path in `script.js` from:
  - `tileLoading: "lazy"`
  - to `tileLoading: "eager"`
- Reverted `manifest-mobile.json` overview reference back to `overview.png` because mobile still uses `useOverview: false`, so changing the manifest overview target was unnecessary and added avoidable ambiguity.

## What Stayed The Same
- Mobile still uses:
  - `manifest-mobile.json`
  - levels `2-5`
  - `tileExtension: "webp"`
  - `tileBuffer: 0`
  - `visible-only` eviction
  - `maxRetainedTiles: 6`
  - `maxScale: 0.4`

## Validation
- `node --check script.js`
- `git diff --check`

## Conclusion
- Mobile still uses WebP tiles.
- The fix removes the most likely Safari-specific loading failure introduced by the first mobile WebP rollout.
