# Strict Mobile-Safe Design World Mode

## Date
- 2026-04-10

## Scope
- Tightened the mobile DESIGN-world renderer further after crash reports continued on iPhone 16 Pro.

## Problem
- The earlier mobile optimization still allowed a detail ceiling that could crash Safari after zooming in and panning.
- Stability on mobile now has higher priority than preserving desktop-level inspection depth.

## Changes
- Reduced the mobile manifest again:
  - removed `level-1`
  - mobile now uses only levels `2` through `5`
- Lowered the mobile zoom ceiling in `script.js` from the previous mobile value to `0.4`.
- Disabled the extra overview image on mobile so the renderer carries one less decoded image layer.
- Switched mobile tile loading to `lazy`.
- Tightened the retained mobile tile budget further.

## Expected Outcome
- Desktop remains unchanged.
- Mobile can still inspect and pan the DESIGN world, but at a deliberately shallower maximum detail level.
- The mobile renderer should stay materially farther below Safari’s memory ceiling during zoom-and-pan behavior.

## Validation
- Ran `node --check script.js`.
- Ran `node --check design-world.js`.
- Verified `manifest-mobile.json` now starts at `level-2`.
