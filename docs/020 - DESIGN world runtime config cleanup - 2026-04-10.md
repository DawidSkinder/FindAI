# DESIGN World Runtime Config Cleanup

## Date
- 2026-04-10

## Scope
- Converted the DESIGN-world runtime split into explicit named mode configs.
- Replaced the old pair of implicit tile-attachment booleans with one named tile attachment strategy.
- No intended behavior change.

## What Changed

### 1. Named Mode Configs
- `script.js` now defines:
  - `mobileDesignWorldConfig`
  - `desktopDesignWorldConfig`
- `activeDesignWorldConfig` now selects between those two explicit objects instead of building one inline conditional object with hidden defaults.

### 2. Explicit Tile Attachment Strategy
- `design-world.js` now uses:
  - `tileAttachMode: "attach-before-load"`
  - `tileAttachMode: "decode-before-attach"`
- This replaces the previous indirect split that depended on:
  - `attachBeforeLoad`
  - `decodeBeforeAttach`

### 3. Mode Assumptions Are Now Written Out
- Mobile config explicitly declares:
  - PNG tiles
  - no overview
  - attach-before-load
  - visible-only eviction
  - no interaction hysteresis
  - no retained extra interactive buffer
- Desktop config explicitly declares:
  - WebP tiles
  - WebP overview
  - decode-before-attach
  - LRU retention
  - hysteresis
  - settled-fill behavior

## Why This Cleanup Matters
- It removes accidental reliance on constructor defaults.
- It makes future runtime changes easier to reason about.
- It reduces the chance of another desktop-first optimization leaking into mobile or vice versa.

## Files Changed
- `script.js`
- `design-world.js`

## Validation
- `node --check script.js`
- `node --check design-world.js`
- `git diff --check`

## Conclusion
- The runtime split is now clearer in code.
- Desktop and mobile still intentionally behave differently, but that difference is now explicit instead of partially hidden in defaults and boolean combinations.
