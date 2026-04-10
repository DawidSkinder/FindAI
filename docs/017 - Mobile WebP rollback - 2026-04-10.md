# Mobile WebP Rollback

## Date
- 2026-04-10

## Scope
- Rolled back the mobile DESIGN-world tile path from WebP to PNG after real-device testing on iPhone Safari still failed to render the world during stage B.

## Why
- Repo-level audit showed:
  - mobile-safe levels `2-5` had complete WebP coverage
  - files were non-zero
  - config wiring was internally consistent
- Real-device behavior still failed.
- That means the practical truth is:
  - the current mobile WebP path is not reliable enough for production use on Safari

## Change
- Removed the mobile-only `tileExtension: "webp"` override from `script.js`.
- Mobile now falls back to the loader default:
  - `.png`

## What Stayed The Same
- Desktop still uses WebP.
- Mobile still keeps:
  - the strict mobile-safe manifest
  - levels `2-5`
  - `tileLoading: "eager"`
  - `tileBuffer: 0`
  - `visible-only` eviction
  - `maxRetainedTiles: 6`
  - `maxScale: 0.4`

## Validation
- `node --check script.js`
- `git diff --check`

## Conclusion
- Desktop remains on the WebP rollout.
- Mobile is intentionally reverted to PNG because the real Safari behavior matters more than theoretical compatibility.
