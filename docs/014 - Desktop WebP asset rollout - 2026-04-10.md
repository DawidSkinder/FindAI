# Desktop WebP Asset Rollout

## Date
- 2026-04-10

## Scope
- Exported WebP companions for the full desktop DESIGN-world asset pyramid.
- Switched the desktop renderer to WebP tiles and WebP overview image.
- Kept the mobile-safe path on PNG assets for now.

## Implemented

### Desktop Runtime Switch
- Desktop now uses:
  - `overview.webp`
  - `level-*/<tile>.webp`
- Mobile continues to use the existing PNG path.

### Loader Changes
- Added `overviewPath` support in `design-world.js` so the desktop overview image can be switched independently from the manifest default.
- Reused the existing `tileExtension` support to point desktop tile loading at `.webp`.

### Export Tooling
- Added `tools/export_webp_pyramid.py` to generate lossless WebP companions from the current PNG pyramid without deleting PNG files.
- Export setting used for this rollout:
  - lossless WebP
  - `quality=100`
  - `method=4`

## Exact Asset Result
- Original PNG pyramid:
  - `323,414,375` bytes
- Exported WebP pyramid:
  - `185,638,182` bytes
- Exact saved payload:
  - `137,776,193` bytes
  - about `131.39 MiB`
- Exact reduction:
  - `42.60%`

## Exact WebP Totals By Group
- `overview.webp`
  - `731,842` bytes
- `level-0`
  - `139,210,692` bytes
- `level-1`
  - `34,392,890` bytes
- `level-2`
  - `8,320,774` bytes
- `level-3`
  - `2,177,826` bytes
- `level-4`
  - `616,630` bytes
- `level-5`
  - `187,528` bytes

## Files Changed
- `design-world.js`
- `script.js`
- `tools/export_webp_pyramid.py`
- `generated/design-v2-smaller-pyramid/**/*.webp`
- `generated/design-v2-smaller-pyramid/overview.webp`

## Validation
- `python3 -m py_compile tools/export_webp_pyramid.py`
- `python3 -m py_compile tools/measure_webp_savings.py`
- `node --check design-world.js`
- `node --check script.js`
- Verified asset counts:
  - `249` PNG files still present
  - `249` WebP files generated

## Remaining Risk
- Browser support is strong for modern browsers, but the meaningful remaining gate is live desktop browser validation on the deployed site:
  - initial load
  - first zoom-in
  - repeated pan/zoom
  - Safari desktop specifically

## Conclusion
- Desktop is now configured to use the new lossless WebP pyramid.
- Mobile is intentionally unchanged for this pass.
- The asset rollout preserves the existing PNG set while reducing desktop asset payload by about `42.6%`.
