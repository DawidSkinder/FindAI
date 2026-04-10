# Mobile WebP Asset Rollout

## Date
- 2026-04-10

## Scope
- Switched the mobile-safe DESIGN-world path from PNG tiles to WebP tiles.
- Reused the already-generated WebP companions from the desktop export pass.
- Did not change the mobile-safe manifest structure, zoom ceiling, or tile-budget strategy.

## Implemented
- Mobile config in `script.js` now sets:
  - `tileExtension: "webp"`
- `manifest-mobile.json` now references `overview.webp` for consistency with the exported asset set, even though the current mobile-safe path still uses `useOverview: false`.

## Asset Coverage
- Mobile-safe pyramid levels use:
  - `level-2`
  - `level-3`
  - `level-4`
  - `level-5`
- Verified coverage:
  - `23` PNG files exist for those levels
  - `23` WebP files exist for those levels

## Files Changed
- `script.js`
- `generated/design-v2-smaller-pyramid/manifest-mobile.json`

## Validation
- `node --check script.js`
- Verified that the mobile-safe levels have matching `.webp` files available.

## Conclusion
- Mobile now points to WebP DESIGN-world tiles instead of PNG for the mobile-safe pyramid.
- Desktop and mobile both use WebP now, but mobile keeps its stricter memory-safe loading rules and reduced detail ceiling.
