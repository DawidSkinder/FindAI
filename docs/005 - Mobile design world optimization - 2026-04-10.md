# Mobile Design World Optimization

## Date
- 2026-04-10

## Scope
- Reduced mobile memory pressure in the DESIGN-world renderer without changing the desktop asset path.
- Kept the existing desktop experience intact.

## Problem
- The desktop pyramid reaches a 30,000 px wide source and includes a very heavy `level-0`.
- On mobile Safari, pinch-zooming into the DESIGN world could trigger a browser crash.
- The previous loader kept old tile elements in memory even after they moved offscreen, which is especially risky on iPhone-class devices.

## Changes
- Added a mobile-only manifest at `generated/design-v2-smaller-pyramid/manifest-mobile.json`.
- The mobile manifest excludes `level-0`, so touch devices never request the heaviest tile tier.
- Added runtime device selection in `script.js` using a coarse-pointer media query:
  - desktop keeps the current full pyramid
  - mobile uses the lighter manifest
- Added a lower mobile zoom ceiling so touch devices cannot drive the canvas to the same maximum zoom range as desktop.
- Added mobile-only aggressive tile eviction in `design-world.js`:
  - offscreen tiles are removed from the DOM instead of only being hidden
  - mobile tile buffer is reduced to `0`
  - retained tile count is capped

## Expected Outcome
- Desktop visuals and zoom behavior remain unchanged.
- Mobile keeps the same concept and interaction flow, but with a lower memory ceiling and lower peak tile pressure.
- Image detail on mobile is intentionally capped below the desktop maximum to avoid Safari crashes.

## Validation
- Ran `node --check script.js`.
- Ran `node --check design-world.js`.
- Reviewed the active mobile configuration and verified that the mobile manifest points only to levels `1` through `5`.
